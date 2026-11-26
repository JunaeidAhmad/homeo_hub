"""Video appointment scheduling models and constraints."""

import uuid

from django.contrib.postgres.constraints import ExclusionConstraint
from django.contrib.postgres.fields import DateTimeRangeField, RangeOperators
from django.db import models
from django.db.models import F, Func, Q, UniqueConstraint, Value


class VideoAppointment(models.Model):
    """A scheduled video consultation between the assigned doctor and patient."""

    class Status(models.TextChoices):
        PROPOSED = "PROPOSED"
        RESCHEDULE_REQUESTED = "RESCHEDULE_REQUESTED"
        ACCEPTED = "ACCEPTED"
        IN_PROGRESS = "IN_PROGRESS"
        COMPLETED = "COMPLETED"
        REJECTED = "REJECTED"
        EXPIRED = "EXPIRED"
        NO_SHOW = "NO_SHOW"
        CANCELLED = "CANCELLED"

    ACTIVE_STATUSES = (
        Status.PROPOSED,
        Status.RESCHEDULE_REQUESTED,
        Status.ACCEPTED,
        Status.IN_PROGRESS,
    )

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    consultation = models.ForeignKey(
        "consultations.DoctorConsultation",
        on_delete=models.CASCADE,
        related_name="appointments",
    )
    doctor = models.ForeignKey(
        "doctors.Doctor",
        on_delete=models.CASCADE,
        related_name="appointments",
    )
    start_at = models.DateTimeField()
    duration_minutes = models.PositiveSmallIntegerField(default=20)
    end_at = models.DateTimeField()
    status = models.CharField(max_length=24, choices=Status.choices, default=Status.PROPOSED)
    meeting_link = models.URLField(max_length=500, blank=True, default="")
    meeting_host = models.CharField(max_length=255, blank=True, default="")

    patient_reminded_30_at = models.DateTimeField(null=True, blank=True)
    patient_reminded_5_at = models.DateTimeField(null=True, blank=True)
    doctor_reminded_30_at = models.DateTimeField(null=True, blank=True)
    doctor_reminded_5_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        indexes = [
            models.Index(fields=["doctor", "start_at"], name="appt_doctor_start"),
            models.Index(fields=["status", "start_at"], name="appt_status_start"),
        ]
        constraints = [
            ExclusionConstraint(
                name="appt_doctor_no_overlap",
                expressions=[
                    (F("doctor"), RangeOperators.EQUAL),
                    (
                        Func(
                            F("start_at"),
                            F("end_at"),
                            Value("[)"),
                            function="tstzrange",
                            output_field=DateTimeRangeField(),
                        ),
                        RangeOperators.OVERLAPS,
                    ),
                ],
                condition=Q(
                    status__in=(
                        "PROPOSED",
                        "RESCHEDULE_REQUESTED",
                        "ACCEPTED",
                        "IN_PROGRESS",
                    )
                ),
            ),
            UniqueConstraint(
                fields=["consultation"],
                condition=Q(
                    status__in=(
                        "PROPOSED",
                        "RESCHEDULE_REQUESTED",
                        "ACCEPTED",
                        "IN_PROGRESS",
                    )
                ),
                name="appt_one_active_per_consultation",
            ),
        ]

    def __str__(self) -> str:
        return f"Appt {self.consultation_id} @ {self.start_at.isoformat()} ({self.status})"


class AppointmentEvent(models.Model):
    """Chronological scheduling & call event on an appointment."""

    class Kind(models.TextChoices):
        PROPOSED = "PROPOSED"
        ACCEPTED = "ACCEPTED"
        REJECTED = "REJECTED"
        RESCHEDULE_REQUESTED = "RESCHEDULE_REQUESTED"
        RESCHEDULED = "RESCHEDULED"
        CANCELLED = "CANCELLED"
        EXPIRED = "EXPIRED"
        CALL_STARTED = "CALL_STARTED"
        CALL_ENDED = "CALL_ENDED"
        NO_SHOW = "NO_SHOW"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    appointment = models.ForeignKey(
        VideoAppointment,
        on_delete=models.CASCADE,
        related_name="events",
    )
    kind = models.CharField(max_length=24, choices=Kind.choices)
    actor_type = models.CharField(max_length=20)
    note = models.CharField(max_length=500, blank=True, default="")
    proposed_start_at = models.DateTimeField(null=True, blank=True)
    preferred_times = models.JSONField(default=list, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at", "id"]

    def __str__(self) -> str:
        return f"{self.kind} ({self.appointment_id})"
