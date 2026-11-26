"""Cart and order models. Never expose shop fields through patient serializers."""

import uuid

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
                condition=Q(self_prescription_item__isnull=False),
                name="cart_item_has_one_source",
            ),
            models.UniqueConstraint(
                fields=["cart", "self_prescription_item"],
                name="cart_item_unique_self_rx_item",
            ),
        ]

    def __str__(self) -> str:
        return f"CartItem {self.id} x{self.quantity}"
