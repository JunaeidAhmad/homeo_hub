"""Payments recorded against orders and shop assignments."""

import uuid

from django.conf import settings
from django.db import models


class Payment(models.Model):
    class Method(models.TextChoices):
        COD = "COD"
        ONLINE = "ONLINE"

    class Status(models.TextChoices):
        PENDING = "PENDING"
        SUCCESS = "SUCCESS"
        FAILED = "FAILED"

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
    status = models.CharField(max_length=15, choices=Status.choices, default=Status.PENDING)
    recorded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"{self.tran_id} ({self.method} {self.status})"
