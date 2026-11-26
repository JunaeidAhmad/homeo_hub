"""Cart and order models. Never expose shop fields through patient serializers."""

import uuid

from django.conf import settings
from django.db import models
from django.db.models import Q


class Cart(models.Model):
    class Status(models.TextChoices):
        ACTIVE = "ACTIVE"
        CHECKED_OUT = "CHECKED_OUT"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    patient = models.ForeignKey("patients.Patient", on_delete=models.CASCADE, related_name="carts")
    status = models.CharField(max_length=15, choices=Status.choices, default=Status.ACTIVE)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["patient"],
                condition=Q(status="ACTIVE"),
                name="cart_one_active_per_patient",
            ),
        ]

    def __str__(self) -> str:
        return f"Cart {self.id} ({self.patient_id}, {self.status})"


class CartItem(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    cart = models.ForeignKey(Cart, on_delete=models.CASCADE, related_name="items")
    self_prescription_item = models.ForeignKey(
        "selfcare.SelfPrescriptionItem",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
    )
    prescription_item = models.ForeignKey(
        "prescriptions.PrescriptionItem",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
    )
    quantity = models.PositiveSmallIntegerField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]
        constraints = [
            models.CheckConstraint(
                condition=Q(quantity__gte=1, quantity__lte=10),
                name="cart_item_quantity_range",
            ),
            models.CheckConstraint(
                condition=(
                    Q(self_prescription_item__isnull=False, prescription_item__isnull=True)
                    | Q(self_prescription_item__isnull=True, prescription_item__isnull=False)
                ),
                name="cart_item_has_one_source",
            ),
            models.UniqueConstraint(
                fields=["cart", "self_prescription_item"],
                name="cart_item_unique_self_rx_item",
            ),
            models.UniqueConstraint(
                fields=["cart", "prescription_item"],
                name="cart_item_unique_rx_item",
            ),
        ]

    def __str__(self) -> str:
        return f"CartItem {self.id} x{self.quantity}"

    @property
    def source_line(self):
        return self.self_prescription_item or self.prescription_item


class Order(models.Model):
    class PaymentMethod(models.TextChoices):
        COD = "COD"
        ONLINE = "ONLINE"

    class Status(models.TextChoices):
        PENDING_PAYMENT = "PENDING_PAYMENT"
        CONFIRMED = "CONFIRMED"
        PAID = "PAID"
        PROCESSING = "PROCESSING"
        SHIPPED = "SHIPPED"
        DELIVERED = "DELIVERED"
        CANCELLED = "CANCELLED"
        RETURNED = "RETURNED"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    code = models.CharField(max_length=24, unique=True)
    patient = models.ForeignKey("patients.Patient", on_delete=models.PROTECT, related_name="orders")
    location = models.ForeignKey("locations.Location", on_delete=models.PROTECT)
    shipping_address = models.JSONField()
    payment_method = models.CharField(max_length=10, choices=PaymentMethod.choices)
    status = models.CharField(max_length=20, choices=Status.choices)
    subtotal_poisha = models.PositiveIntegerField()
    delivery_charge_poisha = models.PositiveIntegerField()
    total_poisha = models.PositiveIntegerField()
    idempotency_key = models.CharField(max_length=128, null=True, blank=True)  # noqa: DJ001
    placed_at = models.DateTimeField(auto_now_add=True)
    cancelled_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-placed_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["patient", "idempotency_key"],
                condition=Q(idempotency_key__isnull=False),
                name="order_patient_idempotency_unique",
            ),
        ]
        indexes = [
            models.Index(fields=["patient", "-placed_at"], name="order_patient_placed"),
            models.Index(fields=["status"], name="order_status"),
        ]

    def __str__(self) -> str:
        return self.code


class ShopAssignment(models.Model):
    class Status(models.TextChoices):
        ASSIGNED = "ASSIGNED"
        PROCESSING = "PROCESSING"
        SHIPPED = "SHIPPED"
        DELIVERED = "DELIVERED"
        RETURNED = "RETURNED"
        CANCELLED = "CANCELLED"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name="assignments")
    shop = models.ForeignKey("shops.Shop", on_delete=models.PROTECT, related_name="assignments")
    assigned_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True
    )
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.ASSIGNED)
    shop_total_poisha = models.PositiveIntegerField(default=0)
    cod_collected_poisha = models.PositiveIntegerField(null=True, blank=True)
    status_changed_at = models.DateTimeField(auto_now_add=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["order", "shop"],
                name="shop_assignment_unique_order_shop",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.order.code} -> {self.shop.name} ({self.status})"


class OrderItem(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name="items")
    self_prescription_item = models.ForeignKey(
        "selfcare.SelfPrescriptionItem",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
    )
    prescription_item = models.ForeignKey(
        "prescriptions.PrescriptionItem",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
    )
    shop_assignment = models.ForeignKey(
        ShopAssignment,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="items",
    )
    shop_remedy = models.ForeignKey(
        "shops.ShopRemedy",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
    )
    shop_unit_price_poisha = models.PositiveIntegerField(null=True, blank=True)
    remedy_name = models.CharField(max_length=150)
    unit_price_poisha = models.PositiveIntegerField()
    quantity = models.PositiveSmallIntegerField()
    line_total_poisha = models.PositiveIntegerField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]
        constraints = [
            models.CheckConstraint(
                condition=(
                    Q(self_prescription_item__isnull=False, prescription_item__isnull=True)
                    | Q(self_prescription_item__isnull=True, prescription_item__isnull=False)
                ),
                name="order_item_has_one_source",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.remedy_name} x{self.quantity}"

    @property
    def source_line(self):
        return self.self_prescription_item or self.prescription_item


class OrderStatusHistory(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name="history")
    # Rows about one shop's part of the order. They stay when the assignment is removed
    # (unassign/reassign), and patients never see them: `shop` marks them for good.
    shop_assignment = models.ForeignKey(
        ShopAssignment,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="history",
    )
    shop = models.ForeignKey(
        "shops.Shop",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="+",
    )
    from_status = models.CharField(max_length=20, blank=True, default="")
    to_status = models.CharField(max_length=20, choices=Order.Status.choices)
    changed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True
    )
    by_patient = models.BooleanField(default=False)
    note = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]

    def __str__(self) -> str:
        return f"{self.order_id}: {self.from_status or 'NEW'} -> {self.to_status}"
