"""Helpers for writing audit entries and snapshotting model fields."""

from __future__ import annotations

from collections.abc import Sequence
from datetime import date, datetime
from typing import Any
from uuid import UUID

from django.contrib.auth.models import User
from django.db import models
from django.http import HttpRequest
from rest_framework.request import Request

from apps.doctors.models import Doctor
from apps.patients.models import Patient
from common.client_address import client_address

from .models import AuditEntry

_SECRET_FIELD_FRAGMENTS = ("password", "secret", "token", "hash", "totp")


def _json_safe(value: Any) -> Any:
    if value is None or isinstance(value, (bool, int, float, str)):
        return value
    if isinstance(value, UUID):
        return str(value)
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, models.Model):
        return str(value.pk)
    if isinstance(value, dict):
        return {str(k): _json_safe(v) for k, v in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [_json_safe(v) for v in value]
    return str(value)


def snapshot(instance: models.Model | None, fields: Sequence[str]) -> dict[str, Any] | None:
    """Capture a JSON-safe dictionary of the given fields, excluding secret names."""
    if instance is None:
        return None
    data: dict[str, Any] = {}
    for field in fields:
        lower = field.lower()
        if any(frag in lower for frag in _SECRET_FIELD_FRAGMENTS):
            continue
        val = getattr(instance, field, None)
        data[field] = _json_safe(val)
    return data


def actor_of(request: Request | HttpRequest | None) -> tuple[str, str, str]:
    """(actor_type, actor_id, actor_label) of whoever made ``request``."""
    return _actor_from_request(request)


def _actor_from_request(request: Request | HttpRequest | None) -> tuple[str, str, str]:
    if request is None:
        return (AuditEntry.ActorType.SYSTEM, "", "system")
    user = getattr(request, "user", None)
    if isinstance(user, User) and user.is_authenticated:
        label = user.username or user.get_full_name() or str(user.pk)
        return (AuditEntry.ActorType.STAFF, str(user.pk), label[:160])
    if isinstance(user, Doctor):
        label = user.doctor_code or user.full_name
        return (AuditEntry.ActorType.DOCTOR, str(user.pk), label[:160])
    if isinstance(user, Patient):
        return (AuditEntry.ActorType.PATIENT, str(user.pk), user.full_name[:160])
    return (AuditEntry.ActorType.SYSTEM, "", "system")


def _target_ref(target: models.Model | tuple[str, str]) -> tuple[str, str]:
    if isinstance(target, tuple):
        return (target[0][:60], str(target[1])[:64])
    return ((target._meta.model_name or "")[:60], str(target.pk)[:64])


def _ip_from_request(request: Request | HttpRequest | None) -> str:
    if request is None:
        return ""
    if isinstance(request, Request):
        return client_address(request)[:64]
    return str(request.META.get("REMOTE_ADDR", ""))[:64]


def change(
    request: Request | HttpRequest | None,
    action: str,
    target: models.Model | tuple[str, str],
    before: dict[str, Any] | None = None,
    after: dict[str, Any] | None = None,
) -> AuditEntry:
    actor_type, actor_id, actor_label = _actor_from_request(request)
    target_type, target_id = _target_ref(target)
    return AuditEntry.objects.create(
        actor_type=actor_type,
        actor_id=actor_id,
        actor_label=actor_label,
        action=action[:80],
        target_type=target_type,
        target_id=target_id,
        ip=_ip_from_request(request),
        before=_json_safe(before) if before is not None else None,
        after=_json_safe(after) if after is not None else None,
    )


def read(
    request: Request | HttpRequest | None,
    action: str,
    target: models.Model | tuple[str, str],
    *,
    actor: tuple[str, str, str] | None = None,
) -> AuditEntry:
    """Record a read. ``actor`` overrides the request's user (for links opened without auth)."""
    actor_type, actor_id, actor_label = actor or _actor_from_request(request)
    target_type, target_id = _target_ref(target)
    return AuditEntry.objects.create(
        actor_type=actor_type,
        actor_id=actor_id,
        actor_label=actor_label,
        action=action[:80],
        target_type=target_type,
        target_id=target_id,
        ip=_ip_from_request(request),
        before=None,
        after=None,
    )
