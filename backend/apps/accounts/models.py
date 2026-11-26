"""Mechanisms shared by every kind of user: one-time codes, text log, sessions.

Who a code or session belongs to is stored as (``user_type``, ``subject_id``) so that
patients, and later doctors and staff, can use them without this app knowing their models.
"""

import uuid

from django.db import models


class OtpChallenge(models.Model):
    class Purpose(models.TextChoices):
        SIGNUP = "SIGNUP"
        DOCTOR_SIGNUP = "DOCTOR_SIGNUP"
        PASSWORD_RESET = "PASSWORD_RESET"  # noqa: S105 (a purpose, not a password)

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    phone = models.CharField(max_length=14)
    purpose = models.CharField(max_length=20, choices=Purpose.choices)
    # Empty for a "decoy" challenge (password reset for an unknown number): it never verifies.
    subject_id = models.CharField(max_length=64, blank=True, default="")
    code_hash = models.CharField(max_length=64)
    expires_at = models.DateTimeField()
    attempts = models.PositiveSmallIntegerField(default=0)
    closed_at = models.DateTimeField(null=True, blank=True)  # used, or replaced by a newer one
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [models.Index(fields=["phone", "purpose"], name="otp_phone_purpose")]

    def __str__(self) -> str:
        return f"{self.purpose} for {self.phone}"


class SmsSend(models.Model):
    """One entry per code requested, for the rate limits."""

    phone = models.CharField(max_length=14)
    delivered = models.BooleanField()  # False for decoys, which cost nothing
    created_at = models.DateTimeField()

    class Meta:
        indexes = [
            models.Index(fields=["phone", "created_at"], name="sms_phone_time"),
            models.Index(fields=["created_at"], name="sms_time"),
        ]

    def __str__(self) -> str:
        return f"{self.phone} at {self.created_at:%Y-%m-%d %H:%M}"


class RefreshToken(models.Model):
    """One link in a session. Each use replaces it with a new link in the same family."""

    family = models.UUIDField(db_index=True)
    user_type = models.CharField(max_length=10)
    subject_id = models.CharField(max_length=64)
    token_hash = models.CharField(max_length=64, unique=True)
    expires_at = models.DateTimeField()
    rotated_at = models.DateTimeField(null=True, blank=True)
    revoked_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [models.Index(fields=["user_type", "subject_id"], name="refresh_subject")]

    def __str__(self) -> str:
        return f"{self.user_type} {self.subject_id} ({self.family})"
