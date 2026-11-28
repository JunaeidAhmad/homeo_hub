"""Doctor sign-up, verification, sign-in, application edits, and admin review."""

import logging
from typing import Any
from uuid import UUID

from django.contrib.auth.hashers import make_password
from django.contrib.auth.models import User
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.files.uploadedfile import UploadedFile
from django.db import IntegrityError, connection, transaction
from django.utils import timezone
from rest_framework.exceptions import ErrorDetail, ValidationError

from apps.accounts import otp, tokens
from apps.accounts.errors import InvalidCredentials
from apps.accounts.models import OtpChallenge
from apps.accounts.sms import send_sms
from apps.locations.models import Location
from apps.notifications.models import NotificationKind
from apps.notifications.services import notify, staff_with_permission
from apps.patients.permissions import PhoneNotVerified
from apps.staff.roles import Perm
from common.errors import ApiError
from common.i18n import current_language
from common.private_files import delete_private, store_private
from common.search import normalize_text

from .models import Doctor, DoctorCertificate
from .signals import doctor_suspended


class DoctorPhoneTaken(ApiError):
    status_code = 409
    error_code = "PHONE_TAKEN"
    default_detail = "There is already a doctor account with this phone number."


class RegistrationNoTaken(ApiError):
    status_code = 409
    error_code = "REGISTRATION_NO_TAKEN"
    default_detail = "That registration number is already registered."


class DoctorSuspended(ApiError):
    status_code = 403
    error_code = "DOCTOR_SUSPENDED"
    default_detail = "This doctor account has been suspended."


class NoCertificates(ApiError):
    status_code = 409
    error_code = "NO_CERTIFICATES"
    default_detail = "Upload at least one certificate first."


class ApplicationLocked(ApiError):
    status_code = 409
    error_code = "APPLICATION_LOCKED"
    default_detail = "Approved or suspended applications cannot be edited."


class InvalidDoctorTransition(ApiError):
    status_code = 409
    error_code = "INVALID_TRANSITION"
    default_detail = "That action is not allowed for the doctor's current status."


def load_principal(subject_id: str) -> Doctor | None:
    return Doctor.objects.filter(pk=subject_id).exclude(status=Doctor.Status.SUSPENDED).first()


def _check_password(password: str, doctor: Doctor | None, field: str = "password") -> None:
    try:
        validate_password(password, user=doctor)  # type: ignore[arg-type]
    except DjangoValidationError as error:
        problems = [ErrorDetail(e.messages[0], code=e.code) for e in error.error_list]
        raise ValidationError({field: problems}) from error


def _next_doctor_code() -> str:
    with connection.cursor() as cursor:
        cursor.execute("SELECT nextval('doctor_code_seq')")
        seq = cursor.fetchone()[0]
    return f"HH-DR-{int(seq):04d}"


def sign_up(
    *,
    phone: str,
    password: str,
    full_name: str,
    registration_no: str,
    qualifications: str,
    experience_years: int,
    location: Location,
    chamber_address: str,
    requested_fee_poisha: int,
) -> OtpChallenge:
    clean_name = normalize_text(full_name).strip()
    clean_reg = normalize_text(registration_no).strip()
    clean_qual = normalize_text(qualifications).strip()
    clean_addr = normalize_text(chamber_address).strip()

    try:
        with transaction.atomic():
            otp.lock_number(phone)
            doctor = Doctor.objects.select_for_update().filter(phone=phone).first()
            if doctor and doctor.is_phone_verified:
                raise DoctorPhoneTaken()
            others = Doctor.objects.exclude(pk=doctor.pk) if doctor else Doctor.objects.all()
            if others.filter(registration_no__iexact=clean_reg).exists():
                raise RegistrationNoTaken()

            doctor = doctor or Doctor(phone=phone)
            doctor.full_name = clean_name
            doctor.registration_no = clean_reg
            doctor.qualifications = clean_qual
            doctor.experience_years = experience_years
            doctor.location = location
            doctor.chamber_address = clean_addr
            doctor.requested_fee_poisha = requested_fee_poisha
            doctor.preferred_language = current_language()
            _check_password(password, doctor)
            doctor.set_password(password)
            doctor.save()
            challenge, code = otp.issue(phone, OtpChallenge.Purpose.DOCTOR_SIGNUP, str(doctor.pk))
    except IntegrityError as error:
        if Doctor.objects.filter(registration_no__iexact=clean_reg).exists():
            raise RegistrationNoTaken() from error
        raise DoctorPhoneTaken() from error

    otp.deliver(challenge, code)
    return challenge


def _sign_in(doctor: Doctor) -> tokens.Session:
    doctor.last_login_at = timezone.now()
    doctor.save(update_fields=["last_login_at", "updated_at"])
    return tokens.open_session(doctor.user_type, str(doctor.pk))


def verify_sign_up(verification_id: UUID, code: str) -> tokens.Session:
    verified: list[Doctor] = []

    def mark_verified(challenge: OtpChallenge) -> None:
        doctor = (
            Doctor.objects.select_for_update()
            .filter(pk=challenge.subject_id)
            .exclude(status=Doctor.Status.SUSPENDED)
            .first()
        )
        if doctor is None or doctor.is_phone_verified:
            raise otp.OtpExpired()
        now = timezone.now()
        doctor.phone_verified_at = now
        doctor.submitted_at = doctor.submitted_at or now
        doctor.save(update_fields=["phone_verified_at", "submitted_at", "updated_at"])
        verified.append(doctor)

    otp.verify(verification_id, code, OtpChallenge.Purpose.DOCTOR_SIGNUP, on_match=mark_verified)
    doc = verified[0]
    doc_id = str(doc.pk)
    doc_name = doc.full_name
    staff_targets = staff_with_permission(Perm.MANAGE_DOCTORS)
    if staff_targets:
        notify(
            NotificationKind.DOCTOR_APPLICATION,
            staff_targets,
            {"name": doc_name},
            f"/admin/doctors/{doc_id}",
        )
    return _sign_in(doc)


def log_in(phone: str, password: str) -> tokens.Session:
    doctor = Doctor.objects.filter(phone=phone).first()
    if doctor is None:
        make_password(password)  # take as long as for a real account
        raise InvalidCredentials()
    if not doctor.check_password(password):
        raise InvalidCredentials()

    if doctor.status == Doctor.Status.SUSPENDED:
        raise DoctorSuspended()

    if not doctor.is_phone_verified:
        challenge, code = otp.issue(
            doctor.phone, OtpChallenge.Purpose.DOCTOR_SIGNUP, str(doctor.pk)
        )
        otp.deliver(challenge, code)
        raise PhoneNotVerified(
            details={
                "verification_id": str(challenge.pk),
                "phone": doctor.phone,
                "resend_after": otp.RESEND_AFTER_SECONDS,
            }
        )
    return _sign_in(doctor)


@transaction.atomic
def update_application(doctor: Doctor, **fields: Any) -> Doctor:
    locked = Doctor.objects.select_for_update().get(pk=doctor.pk)
    if locked.status not in (Doctor.Status.PENDING_APPROVAL, Doctor.Status.REJECTED):
        raise ApplicationLocked()

    if "registration_no" in fields:
        reg = normalize_text(fields["registration_no"]).strip()
        if Doctor.objects.exclude(pk=locked.pk).filter(registration_no__iexact=reg).exists():
            raise RegistrationNoTaken()
        fields["registration_no"] = reg

    for key in ("full_name", "qualifications", "chamber_address"):
        if key in fields and isinstance(fields[key], str):
            fields[key] = normalize_text(fields[key]).strip()

    for key, value in fields.items():
        setattr(locked, key, value)
    locked.save()
    return Doctor.objects.select_related("location").get(pk=locked.pk)


@transaction.atomic
def add_certificate(doctor: Doctor, upload: UploadedFile) -> DoctorCertificate:
    locked = Doctor.objects.select_for_update().get(pk=doctor.pk)
    if locked.status not in (Doctor.Status.PENDING_APPROVAL, Doctor.Status.REJECTED):
        raise ApplicationLocked()
    stored = store_private(upload, f"doctors/{locked.pk}", field="file")
    return DoctorCertificate.objects.create(
        doctor=locked,
        file=stored.name,
        original_name=(upload.name or "certificate")[:255],
        content_type=stored.content_type,
        size=stored.size,
    )


@transaction.atomic
def remove_certificate(doctor: Doctor, cert_id: UUID) -> None:
    locked = Doctor.objects.select_for_update().get(pk=doctor.pk)
    if locked.status not in (Doctor.Status.PENDING_APPROVAL, Doctor.Status.REJECTED):
        raise ApplicationLocked()
    cert = locked.certificates.filter(pk=cert_id).first()
    if cert is None:
        return
    file_name = cert.file
    cert.delete()
    transaction.on_commit(lambda: delete_private(file_name))


@transaction.atomic
def resubmit(doctor: Doctor) -> Doctor:
    locked = Doctor.objects.select_for_update().get(pk=doctor.pk)
    if locked.status != Doctor.Status.REJECTED:
        raise InvalidDoctorTransition()
    if not locked.certificates.exists():
        raise NoCertificates()
    locked.status = Doctor.Status.PENDING_APPROVAL
    locked.rejection_reason = ""
    locked.submitted_at = timezone.now()
    locked.save(update_fields=["status", "rejection_reason", "submitted_at", "updated_at"])
    doc_id = str(locked.pk)
    doc_name = locked.full_name

    def _notify_resubmit() -> None:
        staff_targets = staff_with_permission(Perm.MANAGE_DOCTORS)
        if staff_targets:
            notify(
                NotificationKind.DOCTOR_APPLICATION,
                staff_targets,
                {"name": doc_name},
                f"/admin/doctors/{doc_id}",
            )

    transaction.on_commit(_notify_resubmit)
    return locked


logger = logging.getLogger(__name__)


def _send_doctor_sms(phone: str, message: str) -> None:
    try:
        send_sms(phone, message)
    except Exception:
        # Never roll back an approval/rejection if SMS fails in dev/unconfigured env.
        logger.warning("Failed to send doctor status SMS", exc_info=True)


@transaction.atomic
def approve(doctor: Doctor, staff_user: User, fee_poisha: int) -> Doctor:
    locked = Doctor.objects.select_for_update().get(pk=doctor.pk)
    if locked.status not in (Doctor.Status.PENDING_APPROVAL, Doctor.Status.REJECTED):
        raise InvalidDoctorTransition()
    if not locked.certificates.exists():
        raise NoCertificates()

    if not locked.doctor_code:
        locked.doctor_code = _next_doctor_code()
    locked.consultation_fee_poisha = fee_poisha
    locked.status = Doctor.Status.APPROVED
    locked.rejection_reason = ""
    locked.approved_at = timezone.now()
    locked.approved_by = staff_user
    locked.save(
        update_fields=[
            "doctor_code",
            "consultation_fee_poisha",
            "status",
            "rejection_reason",
            "approved_at",
            "approved_by",
            "updated_at",
        ]
    )

    msg = (
        f"অনুমোদিত হয়েছে। আপনার ডাক্তার আইডি: {locked.doctor_code}।"
        if locked.preferred_language == Doctor.Language.BANGLA
        else f"Approved. Your doctor ID is {locked.doctor_code}."
    )
    transaction.on_commit(lambda: _send_doctor_sms(locked.phone, msg))
    return locked


@transaction.atomic
def reject(doctor: Doctor, staff_user: User, reason: str) -> Doctor:
    locked = Doctor.objects.select_for_update().get(pk=doctor.pk)
    if locked.status != Doctor.Status.PENDING_APPROVAL:
        raise InvalidDoctorTransition()
    clean_reason = normalize_text(reason).strip()
    locked.status = Doctor.Status.REJECTED
    locked.rejection_reason = clean_reason
    locked.rejected_at = timezone.now()
    locked.rejected_by = staff_user
    locked.save(
        update_fields=[
            "status",
            "rejection_reason",
            "rejected_at",
            "rejected_by",
            "updated_at",
        ]
    )

    msg = (
        f"অনুমোদন হয়নি: {clean_reason}। সংশোধন করে আবার জমা দিতে পারেন।"
        if locked.preferred_language == Doctor.Language.BANGLA
        else f"Not approved: {clean_reason}. You can fix and resubmit."
    )
    transaction.on_commit(lambda: _send_doctor_sms(locked.phone, msg))
    return locked


@transaction.atomic
def suspend(doctor: Doctor, staff_user: User, reason: str) -> Doctor:
    locked = Doctor.objects.select_for_update().get(pk=doctor.pk)
    if locked.status != Doctor.Status.APPROVED:
        raise InvalidDoctorTransition()
    locked.status = Doctor.Status.SUSPENDED
    locked.suspension_reason = normalize_text(reason).strip()
    locked.suspended_at = timezone.now()
    locked.suspended_by = staff_user
    locked.save(
        update_fields=[
            "status",
            "suspension_reason",
            "suspended_at",
            "suspended_by",
            "updated_at",
        ]
    )
    tokens.close_all_sessions("doctor", str(locked.pk))
    doctor_suspended.send(sender=Doctor, doctor=locked)
    return locked


@transaction.atomic
def reactivate(doctor: Doctor, staff_user: User) -> Doctor:
    _ = staff_user
    locked = Doctor.objects.select_for_update().get(pk=doctor.pk)
    if locked.status != Doctor.Status.SUSPENDED:
        raise InvalidDoctorTransition()
    locked.status = Doctor.Status.APPROVED
    locked.suspension_reason = ""
    locked.save(update_fields=["status", "suspension_reason", "updated_at"])
    return locked


@transaction.atomic
def set_fee(doctor: Doctor, fee_poisha: int) -> Doctor:
    locked = Doctor.objects.select_for_update().get(pk=doctor.pk)
    if locked.status != Doctor.Status.APPROVED:
        raise InvalidDoctorTransition()
    locked.consultation_fee_poisha = fee_poisha
    locked.save(update_fields=["consultation_fee_poisha", "updated_at"])
    return locked
