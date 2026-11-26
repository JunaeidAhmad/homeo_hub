"""Payments, gateway events, and mock gateway sessions."""

import uuid

from django.conf import settings
from django.db import models


class Payment(models.Model):
    class Method(models.TextChoices):
        COD = "COD"
        ONLINE = "ONLINE"

    class Status(models.TextChoices):
        INITIATED = "INITIATED"
        PENDING = "PENDING"
        SUCCESS = "SUCCESS"
        FAILED = "FAILED"
        CANCELLED = "CANCELLED"
        EXPIRED = "EXPIRED"
        REFUNDED = "REFUNDED"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tran_id = models.CharField(max_length=64, unique=True)
    patient = models.ForeignKey(
        "patients.Patient", on_delete=models.PROTECT, related_name="payments"
    )
    order = models.ForeignKey(
        "orders.Order",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="payments",
    )
    invoice = models.ForeignKey(
        "billing.ConsultationInvoice",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="payments",
    )
    shop_assignment = models.ForeignKey(
        "orders.ShopAssignment",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="payments",
    )
    method = models.CharField(max_length=10, choices=Method.choices)
    gateway = models.CharField(max_length=40, blank=True, default="")
    amount_poisha = models.PositiveIntegerField()
    currency = models.CharField(max_length=10, default="BDT")
    status = models.CharField(max_length=15, choices=Status.choices, default=Status.PENDING)
    session_key = models.CharField(max_length=128, blank=True, default="")
    val_id = models.CharField(max_length=128, blank=True, default="")
    validated_at = models.DateTimeField(null=True, blank=True)
    is_flagged = models.BooleanField(default=False)
    flag_reason = models.TextField(blank=True, default="")
    recorded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"{self.tran_id} ({self.method} {self.status})"


class PaymentEvent(models.Model):
    class Kind(models.TextChoices):
        INITIATE = "INITIATE"
        IPN = "IPN"
        REDIRECT = "REDIRECT"
        VALIDATE = "VALIDATE"
        RECONCILE = "RECONCILE"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    payment = models.ForeignKey(Payment, on_delete=models.CASCADE, related_name="events")
    kind = models.CharField(max_length=15, choices=Kind.choices)
    payload = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]

    def __str__(self) -> str:
        return f"{self.payment.tran_id}: {self.kind}"


class MockGatewaySession(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    session_key = models.CharField(max_length=64, unique=True)
    tran_id = models.CharField(max_length=64, db_index=True)
    amount_poisha = models.PositiveIntegerField()
    currency = models.CharField(max_length=10, default="BDT")
    outcome = models.CharField(max_length=20, blank=True, default="")
    val_id = models.CharField(max_length=64, blank=True, default="")
    return_url = models.CharField(max_length=500, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self) -> str:
        return f"{self.session_key} ({self.tran_id})"
