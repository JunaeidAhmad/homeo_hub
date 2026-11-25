"""Patient accounts: sign-up, verification, sign-in and password reset."""

from uuid import UUID

from django.contrib.auth.hashers import make_password
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError, transaction
from django.utils import timezone
from rest_framework.exceptions import ErrorDetail, ValidationError

from apps.accounts import otp, tokens
from apps.accounts.models import OtpChallenge
from apps.locations.models import Location
from common.errors import ApiError
from common.i18n import current_language

from .models import Patient, date_of_birth_for_age
from .permissions import PhoneNotVerified

Purpose = otp.Purpose


class PhoneTaken(ApiError):
    status_code = 409
    error_code = "PHONE_TAKEN"
    default_detail = "There is already an account with this number."


class InvalidCredentials(ApiError):
    status_code = 401
    error_code = "INVALID_CREDENTIALS"
    default_detail = "The phone number or password is not right."


def load_principal(subject_id: str) -> Patient | None:
    return Patient.objects.filter(pk=subject_id, is_active=True).first()


def check_password_strength(password: str, patient: Patient | None, field: str) -> None:
    try:
        # The validators only read attributes, so a Patient works like a Django user.
        validate_password(password, user=patient)  # type: ignore[arg-type]
    except DjangoValidationError as error:
        problems = [ErrorDetail(e.messages[0], code=e.code) for e in error.error_list]
        raise ValidationError({field: problems}) from error


def sign_up(
    *, phone: str, password: str, full_name: str, gender: str, age: int, location: Location
) -> OtpChallenge:
    """Create (or redo an unverified) account and text a code to prove the number.

    Redoing replaces the details and cancels earlier codes, so only the person who asked
    last (and receives that text) can complete it.
    """
    try:
        with transaction.atomic():
            otp.lock_number(phone)
            patient = Patient.objects.select_for_update().filter(phone=phone).first()
            if patient and patient.is_phone_verified:
                raise PhoneTaken()
            patient = patient or Patient(phone=phone)
            patient.full_name = full_name
            patient.gender = gender
            patient.date_of_birth = date_of_birth_for_age(age, timezone.localdate())
            patient.location = location
            patient.preferred_language = current_language()
            check_password_strength(password, patient, "password")
            patient.set_password(password)
            patient.save()
            challenge, code = otp.issue(phone, Purpose.SIGNUP, str(patient.pk))
    except IntegrityError as error:  # two sign-ups for a new number at the same moment
        raise PhoneTaken() from error
    otp.deliver(challenge, code)
    return challenge


def _sign_in(patient: Patient) -> tokens.Session:
    patient.last_login_at = timezone.now()
    patient.save(update_fields=["last_login_at", "updated_at"])
    return tokens.open_session(patient.user_type, str(patient.pk))


def verify_sign_up(verification_id: UUID, code: str) -> tokens.Session:
    verified: list[Patient] = []

    def mark_verified(challenge: OtpChallenge) -> None:
        # In the same transaction as using up the code, so the account cannot be redone
        # in between. A code never signs in to an account that is already verified.
        patient = (
            Patient.objects.select_for_update()
            .filter(pk=challenge.subject_id, is_active=True)
            .first()
        )
        if patient is None or patient.is_phone_verified:
            raise otp.OtpExpired()
        patient.phone_verified_at = timezone.now()
        patient.save(update_fields=["phone_verified_at", "updated_at"])
        verified.append(patient)

    otp.verify(verification_id, code, Purpose.SIGNUP, on_match=mark_verified)
    return _sign_in(verified[0])


def log_in(phone: str, password: str) -> tokens.Session:
    patient = Patient.objects.filter(phone=phone).first()
    if patient is None:
        make_password(password)  # take as long as for a real account
        raise InvalidCredentials()
    if not patient.check_password(password) or not patient.is_active:
        raise InvalidCredentials()
    if not patient.is_phone_verified:
        challenge, code = otp.issue(phone, Purpose.SIGNUP, str(patient.pk))
        otp.deliver(challenge, code)
        raise PhoneNotVerified(
            details={
                "verification_id": str(challenge.pk),
                "phone": phone,
                "resend_after": otp.RESEND_AFTER_SECONDS,
            }
        )
    return _sign_in(patient)


def start_password_reset(phone: str) -> OtpChallenge:
    """Answers the same way whether or not the number has an account."""
    patient = Patient.objects.filter(phone=phone, is_active=True).first()
    challenge, code = otp.issue(phone, Purpose.PASSWORD_RESET, str(patient.pk) if patient else "")
    otp.deliver(challenge, code)
    return challenge


def reset_password(verification_id: UUID, code: str, new_password: str) -> None:
    # General rules first: they say nothing about any account and spend no code.
    check_password_strength(new_password, None, "new_password")

    def change(challenge: OtpChallenge) -> None:
        # Reached only with the right code, so account-specific feedback is safe here.
        patient = load_principal(challenge.subject_id)
        if patient is None:
            raise otp.OtpExpired()
        check_password_strength(new_password, patient, "new_password")
        patient.set_password(new_password)
        patient.phone_verified_at = patient.phone_verified_at or timezone.now()
        patient.save(update_fields=["password", "phone_verified_at", "updated_at"])
        tokens.close_all_sessions(patient.user_type, str(patient.pk))

    otp.verify(verification_id, code, Purpose.PASSWORD_RESET, on_match=change)
