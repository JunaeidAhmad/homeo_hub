"""Consultation invoices raised when a doctor issues a prescription."""

import uuid

from django.conf import settings
from django.db import models


class ConsultationInvoice(models.Model):
    class Status(models.TextChoices):
        UNPAID = "UNPAID"
        PAID = "PAID"
        WAIVED = "WAIVED"
        VOID = "VOID"
        CLOSED = "CLOSED"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    consultation = models.OneToOneField(
        "consultations.DoctorConsultation",
        on_delete=models.CASCADE,
        related_name="invoice",
    )
    prescription = models.ForeignKey(
        "prescriptions.Prescription",
        on_delete=models.PROTECT,
        related_name="invoices",
    )
    doctor_fee_poisha = models.PositiveIntegerField()
    platform_fee_poisha = models.PositiveIntegerField()
    total_poisha = models.PositiveIntegerField()
    status = models.CharField(
        max_length=15,
        choices=Status.choices,
        default=Status.UNPAID,
    )
    paid_at = models.DateTimeField(null=True, blank=True)
    waived_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="waived_invoices",
    )
    waived_at = models.DateTimeField(null=True, blank=True)
    waive_reason = models.CharField(max_length=300, blank=True, default="")
    closed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="closed_invoices",
    )
    closed_at = models.DateTimeField(null=True, blank=True)
    close_reason = models.CharField(max_length=300, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        indexes = [models.Index(fields=["status"], name="invoice_status")]

    def __str__(self) -> str:
        return f"Invoice {self.consultation.consultation_code} ({self.status})"
