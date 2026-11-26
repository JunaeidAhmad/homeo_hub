"""Immutable audit log of admin edits and clinical record reads."""

import uuid

from django.db import models


class AuditEntry(models.Model):
    class ActorType(models.TextChoices):
        STAFF = "staff"
        DOCTOR = "doctor"
        PATIENT = "patient"
        SYSTEM = "system"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    actor_type = models.CharField(max_length=16, choices=ActorType.choices)
    actor_id = models.CharField(max_length=64, blank=True, default="")
    actor_label = models.CharField(max_length=160, blank=True, default="")
    action = models.CharField(max_length=80)
    target_type = models.CharField(max_length=60)
    target_id = models.CharField(max_length=64)
    ip = models.CharField(max_length=64, blank=True, default="")
    before = models.JSONField(null=True, blank=True)
    after = models.JSONField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        indexes = [
            models.Index(fields=["target_type", "target_id"], name="audit_target"),
            models.Index(fields=["actor_id"], name="audit_actor"),
            models.Index(fields=["created_at"], name="audit_created"),
        ]

    def __str__(self) -> str:
        return f"{self.action} ({self.target_type}:{self.target_id})"
