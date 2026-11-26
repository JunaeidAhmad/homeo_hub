"""Patient self-care selections: what remedy, potency, and form they picked for an illness."""

import uuid

from django.db import models

from apps.remedies.choices import Potency, RemedyForm


class SelfPrescription(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    patient = models.ForeignKey(
        "patients.Patient", on_delete=models.CASCADE, related_name="self_prescriptions"
    )
    illness = models.ForeignKey(
        "illnesses.Illness",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="self_prescriptions",
    )
    location = models.ForeignKey(
        "locations.Location",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
    )
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self) -> str:
        return f"SelfPrescription {self.id} ({self.patient_id})"


class SelfPrescriptionItem(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    self_prescription = models.ForeignKey(
        SelfPrescription, on_delete=models.CASCADE, related_name="items"
    )
    remedy = models.ForeignKey("remedies.Remedy", on_delete=models.PROTECT)
    potency = models.CharField(max_length=10, choices=Potency.choices)
    form = models.CharField(max_length=10, choices=RemedyForm.choices)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self) -> str:
        return f"{self.remedy_id} {self.potency} {self.form}"
