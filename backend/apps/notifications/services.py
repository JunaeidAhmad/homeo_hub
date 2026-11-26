"""Creating notifications, sending SMS + Web Push, and managing subscriptions."""

from __future__ import annotations

import json
import logging
from collections.abc import Iterable, Mapping
from typing import Any

from django.conf import settings
from django.contrib.auth.models import User
from django.db import IntegrityError
from django.utils import timezone
from pywebpush import WebPushException, webpush

from apps.accounts.sms import send_sms
from apps.doctors.models import Doctor
from apps.patients.models import Patient
from apps.staff.roles import Perm

from .messages import render_message
from .models import Notification, PushSubscription, RecipientType

logger = logging.getLogger(__name__)

RecipientLike = Patient | Doctor | User | tuple[str, str]


def staff_with_permission(perm: Perm) -> list[User]:
    """Return every active staff user holding `perm`."""
    users = User.objects.filter(is_active=True, is_staff=True).prefetch_related(
        "groups__permissions", "user_permissions"
    )
    return [user for user in users if user.has_perm(perm.full)]


def _resolve_recipient(target: RecipientLike) -> tuple[str, str, str, str]:
    """Return (recipient_type, recipient_id, phone, preferred_language)."""
    if isinstance(target, Patient):
        return (
            RecipientType.PATIENT,
            str(target.pk),
            target.phone,
            target.preferred_language or "en",
        )
    if isinstance(target, Doctor):
        return (
            RecipientType.DOCTOR,
            str(target.pk),
            target.phone,
            target.preferred_language or "en",
        )
    if isinstance(target, User):
        return (RecipientType.STAFF, str(target.pk), "", "en")
    rtype, rid = target
    phone = ""
    lang = "en"
    if rtype == RecipientType.PATIENT:
        patient = Patient.objects.filter(pk=rid).only("phone", "preferred_language").first()
        if patient:
            phone = patient.phone
            lang = patient.preferred_language or "en"
    elif rtype == RecipientType.DOCTOR:
        doctor = Doctor.objects.filter(pk=rid).only("phone", "preferred_language").first()
        if doctor:
            phone = doctor.phone
            lang = doctor.preferred_language or "en"
    return (rtype, str(rid), phone, lang)


def webpush_configured() -> bool:
    return bool(
        getattr(settings, "WEBPUSH_VAPID_PUBLIC_KEY", "")
        and getattr(settings, "WEBPUSH_VAPID_PRIVATE_KEY", "")
    )


def _send_push_to_recipient(
    recipient_type: str,
    recipient_id: str,
    *,
    title: str,
    body: str,
    url: str,
    tag: str,
) -> None:
    if not webpush_configured():
        return
    subs = list(
        PushSubscription.objects.filter(
            recipient_type=recipient_type,
            recipient_id=recipient_id,
        )
    )
    if not subs:
        return
    payload = json.dumps({"title": title, "body": body, "url": url, "tag": tag})
    subject = getattr(settings, "WEBPUSH_SUBJECT", "") or "mailto:notifications@homeohub.local"
    private_key = settings.WEBPUSH_VAPID_PRIVATE_KEY

    for sub in subs:
        try:
            webpush(
                subscription_info={
                    "endpoint": sub.endpoint,
                    "keys": {"p256dh": sub.p256dh, "auth": sub.auth},
                },
                data=payload,
                vapid_private_key=private_key,
                vapid_claims={"sub": subject},
                timeout=5,
            )
            sub.last_success_at = timezone.now()
            sub.save(update_fields=["last_success_at"])
        except WebPushException as exc:
            status = getattr(getattr(exc, "response", None), "status_code", None)
            if status in (404, 410):
                sub.delete()
            else:
                logger.warning("Web push failed for subscription %s", sub.pk, exc_info=True)
        except Exception:
            logger.warning("Web push failed for subscription %s", sub.pk, exc_info=True)


def notify(
    kind: str,
    recipients: Iterable[RecipientLike],
    context: Mapping[str, Any],
    link: str,
    dedupe_key: str | None = None,
) -> list[Notification]:
    """Create notification rows and send SMS + Web Push. Call only inside transaction.on_commit."""
    title_en, title_bn, body_en, body_bn, should_sms = render_message(kind, context)
    created: list[Notification] = []

    for target in recipients:
        rtype, rid, phone, lang = _resolve_recipient(target)
        try:
            notif = Notification.objects.create(
                recipient_type=rtype,
                recipient_id=rid,
                kind=kind,
                title_en=title_en,
                title_bn=title_bn,
                body_en=body_en,
                body_bn=body_bn,
                link=link,
                dedupe_key=dedupe_key,
            )
            created.append(notif)
        except IntegrityError:
            # Duplicate dedupe_key for this recipient: already notified.
            continue
        except Exception:
            logger.warning(
                "Failed creating notification %s for %s:%s", kind, rtype, rid, exc_info=True
            )
            continue

        local_title = title_bn if lang == "bn" else title_en
        local_body = body_bn if lang == "bn" else body_en

        if should_sms and phone and rtype != RecipientType.STAFF:
            try:
                send_sms(phone, f"HomeoHub: {local_body}")
            except Exception:
                logger.warning(
                    "Failed sending notification SMS to %s:%s", rtype, rid, exc_info=True
                )

        _send_push_to_recipient(
            rtype,
            rid,
            title=local_title,
            body=local_body,
            url=link,
            tag=kind,
        )

    return created


def register_push_subscription(
    recipient_type: str,
    recipient_id: str,
    *,
    endpoint: str,
    p256dh: str,
    auth: str,
    user_agent: str = "",
) -> PushSubscription:
    sub, _ = PushSubscription.objects.update_or_create(
        endpoint=endpoint,
        defaults={
            "recipient_type": recipient_type,
            "recipient_id": recipient_id,
            "p256dh": p256dh,
            "auth": auth,
            "user_agent": user_agent[:300],
        },
    )
    return sub


def remove_push_subscription(
    recipient_type: str,
    recipient_id: str,
    *,
    endpoint: str = "",
) -> int:
    qs = PushSubscription.objects.filter(
        recipient_type=recipient_type,
        recipient_id=recipient_id,
    )
    if endpoint:
        qs = qs.filter(endpoint=endpoint)
    deleted, _ = qs.delete()
    return deleted


def mark_read(recipient_type: str, recipient_id: str, notification_id: str) -> Notification | None:
    notif = Notification.objects.filter(
        pk=notification_id,
        recipient_type=recipient_type,
        recipient_id=recipient_id,
    ).first()
    if notif is None:
        return None
    if notif.read_at is None:
        notif.read_at = timezone.now()
        notif.save(update_fields=["read_at"])
    return notif


def mark_all_read(recipient_type: str, recipient_id: str) -> int:
    return Notification.objects.filter(
        recipient_type=recipient_type,
        recipient_id=recipient_id,
        read_at__isnull=True,
    ).update(read_at=timezone.now())
