"""Consultation lifecycle, transition checks, and patient submission."""

from django.db import connection, transaction
from django.utils import timezone

from apps.illnesses.models import Illness
from apps.patients.models import Patient
from common.errors import ApiError
from common.search import normalize_text

from .models import ConsultationStatusHistory, DoctorConsultation

Status = DoctorConsultation.Status

MAX_OPEN_CONSULTATIONS = 3
CLOSED_STATUSES = (Status.CLOSED, Status.CANCELLED)

ALLOWED_TRANSITIONS: dict[str, set[str]] = {
    "": {Status.SUBMITTED},
    Status.SUBMITTED: {Status.ASSIGNED, Status.CANCELLED},
    Status.ASSIGNED: {Status.IN_REVIEW, Status.SUBMITTED, Status.ASSIGNED, Status.CANCELLED},
    Status.IN_REVIEW: {
        Status.AWAITING_PATIENT,
        Status.PRESCRIBED,
        Status.CLOSED,
        Status.ASSIGNED,
        Status.SUBMITTED,
    },
    Status.AWAITING_PATIENT: {
        Status.RESPONDED,
        Status.PRESCRIBED,
        Status.CLOSED,
        Status.ASSIGNED,
        Status.SUBMITTED,
    },
    Status.RESPONDED: {
        Status.AWAITING_PATIENT,
        Status.PRESCRIBED,
        Status.CLOSED,
        Status.ASSIGNED,
        Status.SUBMITTED,
    },
    Status.PRESCRIBED: {Status.CLOSED},
    Status.CLOSED: set(),
    Status.CANCELLED: set(),
}


class TooManyOpenConsultations(ApiError):
    status_code = 409
    error_code = "TOO_MANY_OPEN_CONSULTATIONS"
    default_detail = "You already have 3 open consultations."


class InvalidConsultationTransition(ApiError):
    status_code = 409
    error_code = "INVALID_TRANSITION"
    default_detail = "That status change is not allowed right now."


class ConsultationNotCancellable(ApiError):
    status_code = 409
    error_code = "CONSULTATION_NOT_CANCELLABLE"
    default_detail = "You can only withdraw a consultation before a doctor is assigned."


def _next_consultation_code() -> str:
    with connection.cursor() as cursor:
        cursor.execute("SELECT nextval('consultation_code_seq')")
        seq = cursor.fetchone()[0]
    return f"HH-CASE-{int(seq):04d}"


def _move(
    consultation: DoctorConsultation,
    to_status: str,
    *,
    actor_type: str,
    actor_id: str = "",
    actor_name: str = "",
    note: str = "",
    initial: bool = False,
) -> ConsultationStatusHistory:
    from_status = "" if initial else consultation.status
    allowed = ALLOWED_TRANSITIONS.get(from_status, set())
    if to_status not in allowed:
        raise InvalidConsultationTransition()
    if not initial:
        consultation.status = to_status
    entry = ConsultationStatusHistory.objects.create(
        consultation=consultation,
        from_status=from_status,
        to_status=to_status,
        actor_type=actor_type,
        actor_id=actor_id,
        actor_name=actor_name,
        note=note,
    )
    return entry


@transaction.atomic
def submit(
    *,
    patient: Patient,
    illness: Illness | None = None,
    chief_complaint: str,
    symptoms: str,
    duration_value: int | None = None,
    duration_unit: str = "",
    symptom_notes: str = "",
    urgency: str = DoctorConsultation.Urgency.ROUTINE,
) -> DoctorConsultation:
    """Create a patient consultation after checking the open-case limit."""
    locked_patient = Patient.objects.select_for_update().get(pk=patient.pk)
    open_count = (
        DoctorConsultation.objects.filter(patient=locked_patient)
        .exclude(status__in=CLOSED_STATUSES)
        .count()
    )
    if open_count >= MAX_OPEN_CONSULTATIONS:
        raise TooManyOpenConsultations()

    consultation = DoctorConsultation.objects.create(
        consultation_code=_next_consultation_code(),
        patient=locked_patient,
        illness=illness,
        chief_complaint=normalize_text(chief_complaint).strip(),
        symptoms=normalize_text(symptoms).strip(),
        duration_value=duration_value,
        duration_unit=duration_unit if duration_value is not None else "",
        symptom_notes=normalize_text(symptom_notes).strip(),
        urgency=urgency,
        status=Status.SUBMITTED,
    )
    _move(
        consultation,
        Status.SUBMITTED,
        actor_type="patient",
        actor_id=str(locked_patient.pk),
        actor_name=locked_patient.full_name,
        initial=True,
    )
    return consultation


@transaction.atomic
def withdraw(
    consultation: DoctorConsultation, patient: Patient, reason: str = ""
) -> DoctorConsultation:
    """Cancel a patient's own consultation while it is still waiting in queue."""
    locked = DoctorConsultation.objects.select_for_update().get(pk=consultation.pk, patient=patient)
    if locked.status != Status.SUBMITTED:
        raise ConsultationNotCancellable()
    clean_reason = normalize_text(reason).strip()
    locked.cancelled_at = timezone.now()
    locked.cancel_reason = clean_reason
    _move(
        locked,
        Status.CANCELLED,
        actor_type="patient",
        actor_id=str(patient.pk),
        actor_name=patient.full_name,
        note=clean_reason,
    )
    locked.save(update_fields=["status", "cancelled_at", "cancel_reason", "updated_at"])
    return locked
