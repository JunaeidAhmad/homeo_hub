"""Staff are Django users (``is_staff``); roles are Django groups."""

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
