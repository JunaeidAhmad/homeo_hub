"""Appointment scheduling state transitions, constraints, and on-read expiry."""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any

from django.db import IntegrityError, transaction
from django.utils import timezone
from rest_framework.exceptions import ErrorDetail, ValidationError

from apps.consultations.models import DoctorConsultation
from apps.doctors.models import Doctor
from apps.notifications.models import NotificationKind
from apps.notifications.services import notify
from apps.patients.models import Patient
from common.errors import ApiError
from common.search import normalize_text

from .models import AppointmentEvent, VideoAppointment
from .reminders import dhaka_time_labels

CaseStatus = DoctorConsultation.Status
Status = VideoAppointment.Status
Kind = AppointmentEvent.Kind

PROPOSE_MIN_LEAD = timedelta(minutes=30)
PROPOSE_ALLOWED_CASE_STATUSES = (
    CaseStatus.IN_REVIEW,
    CaseStatus.AWAITING_PATIENT,
    CaseStatus.RESPONDED,
)


class TooSoonForAppointment(ApiError):
    status_code = 400
    error_code = "TOO_SOON"
    default_detail = "Appointments must be scheduled at least 30 minutes from now."


class DoctorTimeTaken(ApiError):
    status_code = 409
    error_code = "DOCTOR_TIME_TAKEN"
    default_detail = "You already have a scheduled call overlapping that time."


class AppointmentExists(ApiError):
    status_code = 409
    error_code = "APPOINTMENT_EXISTS"
    default_detail = "This consultation already has an active video appointment."


class ProposalExpired(ApiError):
    status_code = 409
    error_code = "PROPOSAL_EXPIRED"
    default_detail = "This proposed appointment time has already passed."


class InvalidAppointmentState(ApiError):
    status_code = 409
    error_code = "INVALID_APPOINTMENT_STATE"
    default_detail = "That action is not allowed in the appointment's current state."


def _validate_slot(start_at: datetime, duration_minutes: int) -> datetime:
    if duration_minutes < 10 or duration_minutes > 60:
        raise ValidationError(
            {
                "duration_minutes": [
                    ErrorDetail("Duration must be between 10 and 60 minutes.", code="invalid")
                ]
            }
        )
    if start_at < timezone.now() + PROPOSE_MIN_LEAD:
        raise TooSoonForAppointment()
    return start_at + timedelta(minutes=duration_minutes)


def _raise_integrity_conflict(exc: IntegrityError) -> None:
    msg = str(exc)
    if "appt_one_active_per_consultation" in msg:
        raise AppointmentExists() from exc
    if "appt_doctor_no_overlap" in msg:
        raise DoctorTimeTaken() from exc
    raise exc


def _notify_for(
    kind: str,
    recipient: Patient | Doctor,
    consultation: DoctorConsultation,
    start_at: datetime,
    *,
    is_patient_target: bool,
) -> None:
    time_en, time_bn = dhaka_time_labels(start_at)
    doctor_name = consultation.assigned_doctor.full_name if consultation.assigned_doctor else ""
    link = f"/care/{consultation.pk}" if is_patient_target else f"/doctor/cases/{consultation.pk}"
    transaction.on_commit(
        lambda: notify(
            kind,
            [recipient],
            {
                "code": consultation.consultation_code,
                "doctor_name": doctor_name,
                "time_en": time_en,
                "time_bn": time_bn,
            },
            link,
        )
    )


@transaction.atomic
def expire_if_passed(appointment: VideoAppointment) -> VideoAppointment:
    """Mark a passed proposal/reschedule request as EXPIRED on read."""
    if appointment.status not in (Status.PROPOSED, Status.RESCHEDULE_REQUESTED):
        return appointment
    now = timezone.now()
    if appointment.start_at > now:
        return appointment

    locked = (
        VideoAppointment.objects.select_for_update()
        .select_related("consultation", "consultation__assigned_doctor", "doctor")
        .get(pk=appointment.pk)
    )
    if locked.status not in (Status.PROPOSED, Status.RESCHEDULE_REQUESTED) or locked.start_at > now:
        return locked

    locked.status = Status.EXPIRED
    locked.save(update_fields=["status", "updated_at"])
    AppointmentEvent.objects.create(
        appointment=locked,
        kind=Kind.EXPIRED,
        actor_type="system",
    )
    _notify_for(
        NotificationKind.CALL_EXPIRED,
        locked.doctor,
        locked.consultation,
        locked.start_at,
        is_patient_target=False,
    )
    return locked


def expire_passed_for(**filters: Any) -> None:
    """Expire any unaccepted passed proposals matching the filter."""
    now = timezone.now()
    candidates = list(
        VideoAppointment.objects.filter(
            status__in=(Status.PROPOSED, Status.RESCHEDULE_REQUESTED),
            start_at__lte=now,
            **filters,
        ).values_list("pk", flat=True)
    )
    for pk in candidates:
        appt = VideoAppointment.objects.filter(pk=pk).first()
        if appt is not None:
            expire_if_passed(appt)


@transaction.atomic
def propose(
    consultation: DoctorConsultation,
    doctor: Doctor,
    *,
    start_at: datetime,
    duration_minutes: int = 20,
    note: str = "",
) -> VideoAppointment:
    expire_passed_for(consultation=consultation)
    locked_case = DoctorConsultation.objects.select_for_update().get(
        pk=consultation.pk, assigned_doctor=doctor
    )
    if locked_case.status not in PROPOSE_ALLOWED_CASE_STATUSES:
        raise InvalidAppointmentState()

    if VideoAppointment.objects.filter(
        consultation=locked_case, status__in=VideoAppointment.ACTIVE_STATUSES
    ).exists():
        raise AppointmentExists()

    end_at = _validate_slot(start_at, duration_minutes)
    clean_note = normalize_text(note).strip()[:500]
    try:
        with transaction.atomic():
            appt = VideoAppointment.objects.create(
                consultation=locked_case,
                doctor=doctor,
                start_at=start_at,
                duration_minutes=duration_minutes,
                end_at=end_at,
                status=Status.PROPOSED,
            )
    except IntegrityError as exc:
        _raise_integrity_conflict(exc)

    AppointmentEvent.objects.create(
        appointment=appt,
        kind=Kind.PROPOSED,
        actor_type="doctor",
        note=clean_note,
        proposed_start_at=start_at,
    )
    _notify_for(
        NotificationKind.CALL_PROPOSED,
        locked_case.patient,
        locked_case,
        start_at,
        is_patient_target=True,
    )
    return appt


@transaction.atomic
def repropose(
    appointment: VideoAppointment,
    doctor: Doctor,
    *,
    start_at: datetime,
    duration_minutes: int = 20,
    note: str = "",
) -> VideoAppointment:
    appointment = expire_if_passed(appointment)
    locked = (
        VideoAppointment.objects.select_for_update()
        .select_related("consultation", "consultation__patient", "consultation__assigned_doctor")
        .get(pk=appointment.pk, doctor=doctor)
    )
    if locked.status not in (Status.RESCHEDULE_REQUESTED, Status.ACCEPTED):
        raise InvalidAppointmentState()

    end_at = _validate_slot(start_at, duration_minutes)
    clean_note = normalize_text(note).strip()[:500]

    locked.start_at = start_at
    locked.duration_minutes = duration_minutes
    locked.end_at = end_at
    locked.status = Status.PROPOSED
    locked.patient_reminded_30_at = None
    locked.patient_reminded_5_at = None
    locked.doctor_reminded_30_at = None
    locked.doctor_reminded_5_at = None
    try:
        with transaction.atomic():
            locked.save(
                update_fields=[
                    "start_at",
                    "duration_minutes",
                    "end_at",
                    "status",
                    "patient_reminded_30_at",
                    "patient_reminded_5_at",
                    "doctor_reminded_30_at",
                    "doctor_reminded_5_at",
                    "updated_at",
                ]
            )
    except IntegrityError as exc:
        _raise_integrity_conflict(exc)

    AppointmentEvent.objects.create(
        appointment=locked,
        kind=Kind.RESCHEDULED,
        actor_type="doctor",
        note=clean_note,
        proposed_start_at=start_at,
    )
    _notify_for(
        NotificationKind.CALL_RESCHEDULED,
        locked.consultation.patient,
        locked.consultation,
        start_at,
        is_patient_target=True,
    )
    return locked


def accept(appointment: VideoAppointment, patient: Patient) -> VideoAppointment:
    # Run expiry outside the atomic error path so EXPIRED stays persisted if we raise 409.
    appointment = expire_if_passed(appointment)
    if appointment.status == Status.EXPIRED:
        raise ProposalExpired()

    with transaction.atomic():
        locked = (
            VideoAppointment.objects.select_for_update()
            .select_related("consultation", "consultation__assigned_doctor", "doctor")
            .get(pk=appointment.pk, consultation__patient=patient)
        )
        if locked.status != Status.PROPOSED:
            raise InvalidAppointmentState()
        locked.status = Status.ACCEPTED
        locked.save(update_fields=["status", "updated_at"])
        AppointmentEvent.objects.create(
            appointment=locked,
            kind=Kind.ACCEPTED,
            actor_type="patient",
        )
        _notify_for(
            NotificationKind.CALL_ACCEPTED,
            locked.doctor,
            locked.consultation,
            locked.start_at,
            is_patient_target=False,
        )
        return locked


def reject(appointment: VideoAppointment, patient: Patient, *, note: str = "") -> VideoAppointment:
    appointment = expire_if_passed(appointment)
    if appointment.status == Status.EXPIRED:
        raise ProposalExpired()

    with transaction.atomic():
        locked = (
            VideoAppointment.objects.select_for_update()
            .select_related("consultation", "consultation__assigned_doctor", "doctor")
            .get(pk=appointment.pk, consultation__patient=patient)
        )
        if locked.status != Status.PROPOSED:
            raise InvalidAppointmentState()
        clean_note = normalize_text(note).strip()[:500]
        locked.status = Status.REJECTED
        locked.save(update_fields=["status", "updated_at"])
        AppointmentEvent.objects.create(
            appointment=locked,
            kind=Kind.REJECTED,
            actor_type="patient",
            note=clean_note,
        )
        _notify_for(
            NotificationKind.CALL_REJECTED,
            locked.doctor,
            locked.consultation,
            locked.start_at,
            is_patient_target=False,
        )
        return locked


def request_reschedule(
    appointment: VideoAppointment,
    patient: Patient,
    *,
    note: str = "",
    preferred_times: list[datetime] | None = None,
) -> VideoAppointment:
    appointment = expire_if_passed(appointment)
    if appointment.status == Status.EXPIRED:
        raise ProposalExpired()

    with transaction.atomic():
        locked = (
            VideoAppointment.objects.select_for_update()
            .select_related("consultation", "consultation__assigned_doctor", "doctor")
            .get(pk=appointment.pk, consultation__patient=patient)
        )
        if locked.status != Status.PROPOSED:
            raise InvalidAppointmentState()
        clean_note = normalize_text(note).strip()[:500]
        cleaned_times = [dt.isoformat() for dt in (preferred_times or [])[:3]]
        locked.status = Status.RESCHEDULE_REQUESTED
        locked.save(update_fields=["status", "updated_at"])
        AppointmentEvent.objects.create(
            appointment=locked,
            kind=Kind.RESCHEDULE_REQUESTED,
            actor_type="patient",
            note=clean_note,
            preferred_times=cleaned_times,
        )
        _notify_for(
            NotificationKind.CALL_RESCHEDULE_REQUESTED,
            locked.doctor,
            locked.consultation,
            locked.start_at,
            is_patient_target=False,
        )
        return locked


def cancel(
    appointment: VideoAppointment,
    *,
    actor_type: str,
    note: str = "",
) -> VideoAppointment:
    appointment = expire_if_passed(appointment)
    with transaction.atomic():
        locked = (
            VideoAppointment.objects.select_for_update()
            .select_related(
                "consultation", "consultation__patient", "consultation__assigned_doctor", "doctor"
            )
            .get(pk=appointment.pk)
        )
        if actor_type == "patient":
            if locked.status != Status.ACCEPTED:
                raise InvalidAppointmentState()
        elif locked.status not in (
            Status.PROPOSED,
            Status.RESCHEDULE_REQUESTED,
            Status.ACCEPTED,
        ):
            raise InvalidAppointmentState()

        clean_note = normalize_text(note).strip()[:500]
        locked.status = Status.CANCELLED
        locked.save(update_fields=["status", "updated_at"])
        AppointmentEvent.objects.create(
            appointment=locked,
            kind=Kind.CANCELLED,
            actor_type=actor_type,
            note=clean_note,
        )
        recipient: Patient | Doctor = (
            locked.doctor if actor_type == "patient" else locked.consultation.patient
        )
        _notify_for(
            NotificationKind.CALL_CANCELLED,
            recipient,
            locked.consultation,
            locked.start_at,
            is_patient_target=(actor_type != "patient"),
        )
        return locked


def cancel_for_withdrawal(consultation: DoctorConsultation) -> None:
    """Cancel any active appointment when a consultation is withdrawn."""
    active = VideoAppointment.objects.filter(
        consultation=consultation,
        status__in=(Status.PROPOSED, Status.RESCHEDULE_REQUESTED, Status.ACCEPTED),
    ).first()
    if active is None:
        return
    active.status = Status.CANCELLED
    active.save(update_fields=["status", "updated_at"])
    AppointmentEvent.objects.create(
        appointment=active,
        kind=Kind.CANCELLED,
        actor_type="patient",
        note="Consultation withdrawn.",
    )
