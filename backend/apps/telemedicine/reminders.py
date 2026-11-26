"""Dhaka time formatting and on-read appointment reminders."""

from __future__ import annotations

from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from django.utils import timezone

from apps.notifications.models import NotificationKind, RecipientType
from apps.notifications.services import notify

from .models import VideoAppointment

DHAKA_TZ = ZoneInfo("Asia/Dhaka")

_BN_DIGITS = str.maketrans("0123456789", "০১২৩৪৫৬৭৮৯")
_BN_MONTHS = (
    "",
    "জানু",
    "ফেব",
    "মার্চ",
    "এপ্রিল",
    "মে",
    "জুন",
    "জুলাই",
    "আগস্ট",
    "সেপ্ট",
    "অক্টো",
    "নভে",
    "ডিসে",
)


def dhaka_time_labels(dt: datetime) -> tuple[str, str]:
    """Return (time_en, time_bn) formatted in Asia/Dhaka."""
    local = dt.astimezone(DHAKA_TZ)
    hour12 = local.hour % 12 or 12
    ampm = "AM" if local.hour < 12 else "PM"
    time_en = f"{local.day} {local.strftime('%b')}, {hour12}:{local.minute:02d} {ampm.lower()}"
    day_bn = str(local.day).translate(_BN_DIGITS)
    hm_bn = f"{hour12}:{local.minute:02d}".translate(_BN_DIGITS)
    period_bn = "সকাল" if local.hour < 12 else ("দুপুর" if local.hour < 17 else "বিকাল/রাত")
    time_bn = f"{day_bn} {_BN_MONTHS[local.month]}, {period_bn} {hm_bn}"
    return time_en, time_bn


def appointment_reminders(recipient_type: str, recipient_id: str) -> None:
    """Send 30-min or 5-min reminders for accepted calls when a participant polls."""
    if recipient_type not in (RecipientType.PATIENT, RecipientType.DOCTOR):
        return

    now = timezone.now()
    horizon = now + timedelta(minutes=30)
    base_qs = VideoAppointment.objects.select_related("consultation").filter(
        status=VideoAppointment.Status.ACCEPTED,
        start_at__gt=now,
        start_at__lte=horizon,
    )
    if recipient_type == RecipientType.PATIENT:
        appts = list(base_qs.filter(consultation__patient_id=recipient_id))
        flag_30, flag_5 = "patient_reminded_30_at", "patient_reminded_5_at"
    else:
        appts = list(base_qs.filter(doctor_id=recipient_id))
        flag_30, flag_5 = "doctor_reminded_30_at", "doctor_reminded_5_at"

    for appt in appts:
        remaining = appt.start_at - now
        if remaining <= timedelta(minutes=5):
            field, kind, suffix = flag_5, NotificationKind.CALL_REMINDER_5, "r5"
        else:
            field, kind, suffix = flag_30, NotificationKind.CALL_REMINDER_30, "r30"

        if getattr(appt, field) is not None:
            continue

        updated = VideoAppointment.objects.filter(pk=appt.pk, **{f"{field}__isnull": True}).update(
            **{field: now}
        )
        if not updated:
            continue

        time_en, time_bn = dhaka_time_labels(appt.start_at)
        link = (
            f"/care/{appt.consultation_id}"
            if recipient_type == RecipientType.PATIENT
            else f"/doctor/cases/{appt.consultation_id}"
        )
        notify(
            kind,
            [(recipient_type, recipient_id)],
            {
                "code": appt.consultation.consultation_code,
                "time_en": time_en,
                "time_bn": time_bn,
            },
            link,
            dedupe_key=f"appt:{appt.pk}:{recipient_type}:{suffix}",
        )
