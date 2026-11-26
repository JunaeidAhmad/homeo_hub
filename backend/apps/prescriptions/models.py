"""Versioned doctor prescriptions, remedy lines, and lifestyle advice."""

import uuid

from django.db import models
from django.db.models import Q

from apps.remedies.choices import Potency, RemedyForm


class Prescription(models.Model):
    class Status(models.TextChoices):
        ACTIVE = "ACTIVE"
        SUPERSEDED = "SUPERSEDED"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    consultation = models.ForeignKey(
        "consultations.DoctorConsultation",
        on_delete=models.CASCADE,
        related_name="prescriptions",
    )
    doctor = models.ForeignKey(
        "doctors.Doctor",
        on_delete=models.PROTECT,
        related_name="prescriptions",
    )
    version = models.PositiveSmallIntegerField()
    previous = models.ForeignKey(
        "self",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="superseded_by",
    )
    status = models.CharField(
        max_length=15,
        choices=Status.choices,
        default=Status.ACTIVE,
    )
    report_after_date = models.DateField(null=True, blank=True)
    # Doctor-only notes. Never include in any patient-facing serializer.
    doctor_notes = models.TextField(blank=True, default="")
    issued_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-version", "-issued_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["consultation"],
                condition=Q(status="ACTIVE"),
                name="prescription_one_active_per_consultation",
            ),
            models.UniqueConstraint(
                fields=["consultation", "version"],
                name="prescription_unique_version_per_consultation",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.consultation.consultation_code} v{self.version} ({self.status})"


class PrescriptionItem(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    prescription = models.ForeignKey(
        Prescription,
        on_delete=models.CASCADE,
        related_name="items",
    )
    position = models.PositiveSmallIntegerField()
    remedy = models.ForeignKey(
        "remedies.Remedy",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="prescription_items",
    )
    remedy_name = models.CharField(max_length=150)
    potency = models.CharField(max_length=10, choices=Potency.choices)
    form = models.CharField(max_length=10, choices=RemedyForm.choices)
    dosage = models.CharField(max_length=100)
    frequency = models.CharField(max_length=100)
    duration = models.CharField(max_length=100)

    class Meta:
        ordering = ["position", "id"]

    def __str__(self) -> str:
        return f"{self.remedy_name} {self.potency} ({self.form})"


class PrescriptionAdvice(models.Model):
    class Kind(models.TextChoices):
        DO = "DO"
        DONT = "DONT"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    prescription = models.ForeignKey(
        Prescription,
        on_delete=models.CASCADE,
        related_name="advice",
    )
    kind = models.CharField(max_length=10, choices=Kind.choices)
    text = models.CharField(max_length=300)
    position = models.PositiveSmallIntegerField()

    class Meta:
        ordering = ["kind", "position", "id"]

    def __str__(self) -> str:
        return f"{self.kind}: {self.text[:40]}"
