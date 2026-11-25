"""One-time codes sent by text.

``issue`` / ``reissue`` change the database and return the code; call ``deliver`` after
your transaction has finished. ``verify`` consumes a code.
"""

import logging
import math
import secrets
from collections.abc import Callable
from datetime import timedelta
from uuid import UUID

from django.conf import settings
from django.db import connection, transaction
from django.utils import timezone
from django.utils.crypto import constant_time_compare, salted_hmac
from rest_framework.exceptions import Throttled

from common.errors import ApiError
from common.i18n import current_language
from common.phone import ascii_digits

from .models import OtpChallenge, SmsSend
from .sms import SmsUnavailable, ensure_sms_configured, send_sms

logger = logging.getLogger(__name__)
Purpose = OtpChallenge.Purpose

CODE_LIFETIME = timedelta(minutes=5)
# Resending cannot keep one verification going for longer than this.
CHALLENGE_LIFETIME = timedelta(minutes=30)
RESEND_AFTER_SECONDS = 60
MAX_ATTEMPTS = 5
SENDS_PER_NUMBER = 3
SENDS_WINDOW = timedelta(minutes=15)

MESSAGES = {
    "en": "HomeoHub code: {code}. Valid for 5 minutes. Do not share it.",
    "bn": "হোমিওহাব কোড: {code}। ৫ মিনিট পর্যন্ত কার্যকর। কাউকে জানাবেন না।",
}


class OtpInvalid(ApiError):
    error_code = "OTP_INVALID"
    default_detail = "That code is not right."


class OtpExpired(ApiError):
    error_code = "OTP_EXPIRED"
    default_detail = "That code can no longer be used. Ask for a new one."


class OtpTooManyAttempts(ApiError):
    error_code = "OTP_TOO_MANY_ATTEMPTS"
    default_detail = "Too many wrong tries. Ask for a new code."


def _hash(challenge_id: UUID, code: str) -> str:
    return salted_hmac("accounts.otp", f"{challenge_id}:{code}", algorithm="sha256").hexdigest()


def lock_number(phone: str) -> None:
    """Serialise requests for one number until the surrounding transaction ends."""
    with connection.cursor() as cursor:
        cursor.execute("SELECT pg_advisory_xact_lock(hashtext(%s))", [f"otp:{phone}"])


def _spend_send(phone: str, *, delivered: bool) -> None:
    """Record one send, or refuse if the number (or the whole service) is over its limit."""
    now = timezone.now()
    recent = list(
        SmsSend.objects.filter(phone=phone, created_at__gt=now - SENDS_WINDOW)
        .order_by("created_at")
        .values_list("created_at", flat=True)
    )
    if len(recent) >= SENDS_PER_NUMBER:
        oldest = recent[-SENDS_PER_NUMBER]
        raise Throttled(wait=math.ceil((oldest + SENDS_WINDOW - now).total_seconds()))
    # Applies to decoys too (which do not count towards it), or the refusal would
    # reveal which numbers have accounts.
    last_hour = SmsSend.objects.filter(delivered=True, created_at__gt=now - timedelta(hours=1))
    if last_hour.count() >= settings.OTP_MAX_SENDS_PER_HOUR:
        raise Throttled(wait=15 * 60)
    SmsSend.objects.create(phone=phone, delivered=delivered, created_at=now)


def _set_new_code(challenge: OtpChallenge) -> str:
    code = f"{secrets.randbelow(1_000_000):06d}"
    challenge.code_hash = _hash(challenge.pk, code)
    challenge.expires_at = timezone.now() + CODE_LIFETIME
    challenge.attempts = 0
    return code


@transaction.atomic
def issue(phone: str, purpose: str, subject_id: str = "") -> tuple[OtpChallenge, str]:
    """A new challenge for ``phone``; earlier ones for the same purpose stop working."""
    ensure_sms_configured()
    lock_number(phone)
    _spend_send(phone, delivered=bool(subject_id))
    OtpChallenge.objects.filter(phone=phone, purpose=purpose, closed_at__isnull=True).update(
        closed_at=timezone.now()
    )
    challenge = OtpChallenge(phone=phone, purpose=purpose, subject_id=subject_id)
    code = _set_new_code(challenge)
    challenge.save()
    return challenge, code


@transaction.atomic
def reissue(challenge_id: UUID) -> tuple[OtpChallenge, str]:
    """A fresh code for an open challenge (the "resend" button)."""
    ensure_sms_configured()
    found = OtpChallenge.objects.filter(
        pk=challenge_id,
        closed_at__isnull=True,
        created_at__gt=timezone.now() - CHALLENGE_LIFETIME,
    ).first()
    if found is None:
        raise OtpExpired()
    lock_number(found.phone)
    challenge = OtpChallenge.objects.select_for_update().get(pk=found.pk)
    if challenge.closed_at:
        raise OtpExpired()
    _spend_send(challenge.phone, delivered=bool(challenge.subject_id))
    code = _set_new_code(challenge)
    challenge.save()
    return challenge, code


def deliver(challenge: OtpChallenge, code: str) -> None:
    if not challenge.subject_id:
        return  # decoy: behave the same, send nothing
    try:
        send_sms(challenge.phone, MESSAGES[current_language()].format(code=code))
    except SmsUnavailable:
        if challenge.purpose != Purpose.PASSWORD_RESET:
            raise
        # Only real accounts are texted, so reporting the failure would reveal them.
        logger.error("A password reset code could not be sent")


def verify(
    challenge_id: UUID,
    code: str,
    purpose: str,
    on_match: Callable[[OtpChallenge], None] | None = None,
) -> OtpChallenge:
    """Consume the code. Wrong tries are counted (and kept) even though an error is raised.

    ``on_match`` runs only for a correct code, in the same transaction: if it raises,
    nothing it did is kept and the code stays usable.
    """
    typed = ascii_digits(code).strip()
    error: ApiError | None = None
    with transaction.atomic():
        phone = OtpChallenge.objects.filter(pk=challenge_id).values_list("phone", flat=True).first()
        if phone:
            lock_number(phone)  # before any row locks: the same order as issuing a code
        challenge = OtpChallenge.objects.select_for_update().filter(pk=challenge_id).first()
        if (
            challenge is None
            or challenge.purpose != purpose
            or challenge.closed_at
            or challenge.expires_at <= timezone.now()
        ):
            error = OtpExpired()
        elif challenge.attempts >= MAX_ATTEMPTS:
            error = OtpTooManyAttempts()
        elif (
            not constant_time_compare(_hash(challenge.pk, typed), challenge.code_hash)
            or not challenge.subject_id
        ):
            challenge.attempts += 1
            challenge.save(update_fields=["attempts"])
            error = OtpInvalid(details={"attempts_left": MAX_ATTEMPTS - challenge.attempts})
        else:
            if on_match:
                on_match(challenge)
            # The number is proven: every other outstanding code for it dies too.
            OtpChallenge.objects.filter(phone=challenge.phone, closed_at__isnull=True).update(
                closed_at=timezone.now()
            )
    if error:
        raise error
    assert challenge is not None
    return challenge
