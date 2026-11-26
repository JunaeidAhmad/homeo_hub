"""In-app notifications and Web Push subscriptions."""

import uuid

from django.db import models
from django.db.models import Q


class RecipientType(models.TextChoices):
    PATIENT = "patient"
    DOCTOR = "doctor"
    STAFF = "staff"


class NotificationKind(models.TextChoices):
    DOCTOR_ASSIGNED = "DOCTOR_ASSIGNED"
    QUESTIONS_SENT = "QUESTIONS_SENT"
    PATIENT_ANSWERED = "PATIENT_ANSWERED"
    PRESCRIPTION_READY = "PRESCRIPTION_READY"
    PAYMENT_RESULT = "PAYMENT_RESULT"
    ORDER_STATUS_CHANGED = "ORDER_STATUS_CHANGED"
    CONSULTATION_WAITING = "CONSULTATION_WAITING"
    DOCTOR_APPLICATION = "DOCTOR_APPLICATION"


class Notification(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    recipient_type = models.CharField(max_length=16, choices=RecipientType.choices)
    recipient_id = models.CharField(max_length=64)
    kind = models.CharField(max_length=32, choices=NotificationKind.choices)
    title_en = models.CharField(max_length=160)
    title_bn = models.CharField(max_length=160)
    body_en = models.CharField(max_length=500)
    body_bn = models.CharField(max_length=500)
    link = models.CharField(max_length=300)
    dedupe_key = models.CharField(max_length=160, null=True, blank=True)  # noqa: DJ001
    read_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        indexes = [
            models.Index(
                fields=["recipient_type", "recipient_id", "read_at"],
                name="notif_recipient_read",
            ),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["recipient_type", "recipient_id", "dedupe_key"],
                condition=Q(dedupe_key__isnull=False),
                name="notif_recipient_dedupe_unique",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.kind} -> {self.recipient_type}:{self.recipient_id}"


class PushSubscription(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    recipient_type = models.CharField(max_length=16, choices=RecipientType.choices)
    recipient_id = models.CharField(max_length=64)
    endpoint = models.TextField(unique=True)
    p256dh = models.CharField(max_length=255)
    auth = models.CharField(max_length=255)
    user_agent = models.CharField(max_length=300, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    last_success_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(
                fields=["recipient_type", "recipient_id"],
                name="push_sub_recipient",
            ),
        ]

    def __str__(self) -> str:
        return f"PushSub {self.recipient_type}:{self.recipient_id}"
