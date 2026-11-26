"""Staff are Django users (``is_staff``); roles are Django groups."""

import uuid

from django.conf import settings
from django.db import models

from .roles import PERMISSION_DESCRIPTIONS


class AccessRight(models.Model):
    """No table: only a place for Django to hang the admin permissions on."""

    class Meta:
        managed = False
        default_permissions = ()
        permissions = [(perm.value, text) for perm, text in PERMISSION_DESCRIPTIONS.items()]

    def __str__(self) -> str:
        return "Access right"


class StaffTotp(models.Model):
    """Encrypted TOTP authenticator secret and replay counter for a staff member."""

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="totp",
    )
    encrypted_secret = models.TextField()
    confirmed_at = models.DateTimeField(null=True, blank=True)
    last_used_step = models.BigIntegerField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self) -> str:
        return f"TOTP for {self.user_id}"


class StaffRecoveryCode(models.Model):
    """One-time hashed recovery codes generated when a staff member sets up TOTP."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="recovery_codes",
    )
    code_hash = models.CharField(max_length=128)
    used_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]

    def __str__(self) -> str:
        return f"RecoveryCode for {self.user_id}"
