import uuid

from django.db import models


class DoctorConsultation(models.Model):
    """A consultation case submitted by a patient and handled by an assigned doctor."""

    class Status(models.TextChoices):
        SUBMITTED = "SUBMITTED"
        ASSIGNED = "ASSIGNED"
        IN_REVIEW = "IN_REVIEW"
        AWAITING_PATIENT = "AWAITING_PATIENT"
        RESPONDED = "RESPONDED"
        PRESCRIBED = "PRESCRIBED"
        CLOSED = "CLOSED"
        CANCELLED = "CANCELLED"

    class Urgency(models.TextChoices):
        ROUTINE = "ROUTINE"
        SOON = "SOON"
        URGENT = "URGENT"

    class DurationUnit(models.TextChoices):
        DAYS = "DAYS"
        WEEKS = "WEEKS"
        MONTHS = "MONTHS"
        YEARS = "YEARS"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    consultation_code = models.CharField(max_length=24, unique=True)
    patient = models.ForeignKey(
        "patients.Patient",
        on_delete=models.CASCADE,
        related_name="consultations",
    )
    assigned_doctor = models.ForeignKey(
        "doctors.Doctor",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="consultations",
    )
    illness = models.ForeignKey(
        "illnesses.Illness",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="consultations",
    )
    chief_complaint = models.CharField(max_length=200)
    symptoms = models.TextField()
    duration_value = models.PositiveSmallIntegerField(null=True, blank=True)
    duration_unit = models.CharField(
        max_length=10, choices=DurationUnit.choices, blank=True, default=""
    )
    symptom_notes = models.TextField(blank=True, default="")
    urgency = models.CharField(max_length=10, choices=Urgency.choices, default=Urgency.ROUTINE)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.SUBMITTED)

    submitted_at = models.DateTimeField(auto_now_add=True)
    assigned_at = models.DateTimeField(null=True, blank=True)
    opened_at = models.DateTimeField(null=True, blank=True)
    closed_at = models.DateTimeField(null=True, blank=True)
    cancelled_at = models.DateTimeField(null=True, blank=True)
    cancel_reason = models.CharField(max_length=300, blank=True, default="")
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-submitted_at", "-id"]
        indexes = [
            models.Index(fields=["status"], name="consult_status"),
            models.Index(fields=["submitted_at"], name="consult_submitted"),
            models.Index(fields=["patient", "status"], name="consult_patient_status"),
            models.Index(fields=["assigned_doctor", "status"], name="consult_doctor_status"),
        ]

    def __str__(self) -> str:
        return f"{self.consultation_code} ({self.status})"


class ConsultationStatusHistory(models.Model):
    """Audit trail of status moves on a consultation."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    consultation = models.ForeignKey(
        DoctorConsultation,
        on_delete=models.CASCADE,
        related_name="history",
    )
    from_status = models.CharField(
        max_length=20, choices=DoctorConsultation.Status.choices, blank=True, default=""
    )
    to_status = models.CharField(max_length=20, choices=DoctorConsultation.Status.choices)
    actor_type = models.CharField(max_length=20)
    actor_id = models.CharField(max_length=64, blank=True, default="")
    actor_name = models.CharField(max_length=120, blank=True, default="")
    note = models.CharField(max_length=300, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at", "id"]

    def __str__(self) -> str:
        previous = self.from_status or "NEW"
        return f"{self.consultation.consultation_code}: {previous} -> {self.to_status}"
