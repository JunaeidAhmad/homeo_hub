"""Consultation lifecycle, transition checks, assignment, and doctor review."""

import logging
import math
from typing import Any

from django.contrib.auth.models import User
from django.core.files.uploadedfile import UploadedFile
from django.db import connection, transaction
from django.db.models import Max
from django.utils import timezone
from rest_framework.exceptions import ErrorDetail, ValidationError

from apps.accounts.sms import send_sms
from apps.doctors.models import Doctor
from apps.illnesses.models import Illness
from apps.patients.models import Patient
from common.errors import ApiError
from common.private_files import store_private
from common.search import normalize_text

from .models import (
    Answer,
    ConsultationStatusHistory,
    DoctorConsultation,
    Question,
    QuestionSet,
)

logger = logging.getLogger(__name__)

Status = DoctorConsultation.Status

MAX_OPEN_CONSULTATIONS = 3
CLOSED_STATUSES = (Status.CLOSED, Status.COMPLETED, Status.CLOSED_UNPAID, Status.CANCELLED)

ALLOWED_TRANSITIONS: dict[str, set[str]] = {
    "": {Status.SUBMITTED},
    Status.SUBMITTED: {Status.ASSIGNED, Status.CANCELLED},
    Status.ASSIGNED: {
        Status.IN_REVIEW,
        Status.AWAITING_PATIENT,
        Status.SUBMITTED,
        Status.ASSIGNED,
        Status.CANCELLED,
    },
    Status.IN_REVIEW: {
        Status.AWAITING_PATIENT,
        Status.PRESCRIBED,
        Status.CLOSED,
        Status.ASSIGNED,
        Status.SUBMITTED,
    },
    Status.AWAITING_PATIENT: {
        Status.AWAITING_PATIENT,
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
    Status.PRESCRIBED: {Status.CLOSED, Status.COMPLETED, Status.CLOSED_UNPAID},
    Status.COMPLETED: set(),
    Status.CLOSED_UNPAID: set(),
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


class DoctorNotAssignable(ApiError):
    status_code = 409
    error_code = "DOCTOR_NOT_ASSIGNABLE"
    default_detail = "Only approved doctors can be assigned to consultations."


class QuestionSetAlreadyAnswered(ApiError):
    status_code = 409
    error_code = "QUESTION_SET_ALREADY_ANSWERED"
    default_detail = "These questions have already been answered."


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
    from apps.billing.services import void_unpaid_invoice

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
    void_unpaid_invoice(locked)
    return locked


def move_to_prescribed(
    consultation: DoctorConsultation,
    *,
    doctor: Doctor,
    note: str = "",
) -> ConsultationStatusHistory:
    """Transition an open consultation under review to PRESCRIBED."""
    if consultation.status == Status.ASSIGNED:
        consultation.opened_at = consultation.opened_at or timezone.now()
        _move(
            consultation,
            Status.IN_REVIEW,
            actor_type="doctor",
            actor_id=str(doctor.pk),
            actor_name=doctor.full_name,
        )
    elif consultation.status not in (
        Status.IN_REVIEW,
        Status.AWAITING_PATIENT,
        Status.RESPONDED,
    ):
        raise InvalidConsultationTransition()

    entry = _move(
        consultation,
        Status.PRESCRIBED,
        actor_type="doctor",
        actor_id=str(doctor.pk),
        actor_name=doctor.full_name,
        note=note,
    )
    consultation.save(update_fields=["status", "opened_at", "updated_at"])
    return entry


def move_to_completed(
    consultation: DoctorConsultation,
    *,
    actor_type: str,
    actor_id: str = "",
    actor_name: str = "",
    note: str = "",
) -> ConsultationStatusHistory | None:
    """Transition a PRESCRIBED consultation to COMPLETED when paid or waived."""
    if consultation.status != Status.PRESCRIBED:
        return None
    consultation.closed_at = consultation.closed_at or timezone.now()
    entry = _move(
        consultation,
        Status.COMPLETED,
        actor_type=actor_type,
        actor_id=actor_id,
        actor_name=actor_name,
        note=note,
    )
    consultation.save(update_fields=["status", "closed_at", "updated_at"])
    return entry


def move_to_closed_unpaid(
    consultation: DoctorConsultation,
    *,
    staff_user: User,
    note: str = "",
) -> ConsultationStatusHistory | None:
    """Transition a PRESCRIBED consultation to CLOSED_UNPAID when staff closes its invoice."""
    if consultation.status != Status.PRESCRIBED:
        return None
    consultation.closed_at = consultation.closed_at or timezone.now()
    entry = _move(
        consultation,
        Status.CLOSED_UNPAID,
        actor_type="staff",
        actor_id=str(staff_user.pk),
        actor_name=staff_user.get_full_name() or staff_user.username,
        note=note,
    )
    consultation.save(update_fields=["status", "closed_at", "updated_at"])
    return entry


def _send_consultation_sms(phone: str, message: str) -> None:
    try:
        send_sms(phone, message)
    except Exception:
        logger.warning("Failed to send consultation SMS notification", exc_info=True)


@transaction.atomic
def assign(
    consultation: DoctorConsultation,
    doctor: Doctor,
    staff_user: User,
    note: str = "",
) -> DoctorConsultation:
    """Assign (or reassign) a consultation to an approved doctor."""
    locked = DoctorConsultation.objects.select_for_update().get(pk=consultation.pk)
    locked_doctor = Doctor.objects.select_for_update().get(pk=doctor.pk)
    if locked_doctor.status != Doctor.Status.APPROVED:
        raise DoctorNotAssignable()

    clean_note = normalize_text(note).strip()
    doc_label = (
        f"{locked_doctor.full_name} ({locked_doctor.doctor_code})"
        if locked_doctor.doctor_code
        else locked_doctor.full_name
    )
    audit_note = clean_note or f"Assigned to {doc_label}"
    actor_name = staff_user.get_full_name() or staff_user.username

    locked.assigned_doctor = locked_doctor
    locked.assigned_at = timezone.now()
    _move(
        locked,
        Status.ASSIGNED,
        actor_type="staff",
        actor_id=str(staff_user.pk),
        actor_name=actor_name,
        note=audit_note,
    )
    locked.save(update_fields=["assigned_doctor", "assigned_at", "status", "updated_at"])

    patient_phone = locked.patient.phone
    doctor_phone = locked_doctor.phone
    case_code = locked.consultation_code
    doc_name = locked_doctor.full_name

    def _notify() -> None:
        _send_consultation_sms(
            patient_phone,
            f"HomeoHub: Your consultation {case_code} has been assigned to {doc_name}.",
        )
        _send_consultation_sms(
            doctor_phone,
            f"HomeoHub: Case {case_code} has been assigned to you for review.",
        )

    transaction.on_commit(_notify)
    return locked


@transaction.atomic
def open_case(consultation: DoctorConsultation, doctor: Doctor) -> DoctorConsultation:
    """Move an ASSIGNED consultation to IN_REVIEW when the assigned doctor opens it."""
    locked = DoctorConsultation.objects.select_for_update().get(
        pk=consultation.pk, assigned_doctor=doctor
    )
    if locked.status == Status.ASSIGNED:
        locked.opened_at = locked.opened_at or timezone.now()
        _move(
            locked,
            Status.IN_REVIEW,
            actor_type="doctor",
            actor_id=str(doctor.pk),
            actor_name=doctor.full_name,
        )
        locked.save(update_fields=["status", "opened_at", "updated_at"])
        return locked
    if locked.status in (
        Status.IN_REVIEW,
        Status.AWAITING_PATIENT,
        Status.RESPONDED,
        Status.PRESCRIBED,
    ):
        return locked
    raise InvalidConsultationTransition()


@transaction.atomic
def return_to_queue(doctor: Doctor) -> int:
    """Return open cases of a newly suspended doctor back to SUBMITTED."""
    open_cases = list(
        DoctorConsultation.objects.select_for_update().filter(
            assigned_doctor=doctor,
            status__in=(
                Status.ASSIGNED,
                Status.IN_REVIEW,
                Status.AWAITING_PATIENT,
                Status.RESPONDED,
            ),
        )
    )
    doc_label = doctor.doctor_code or str(doctor.pk)
    for case in open_cases:
        case.assigned_doctor = None
        case.assigned_at = None
        _move(
            case,
            Status.SUBMITTED,
            actor_type="system",
            actor_name="system",
            note=f"Returned to queue after doctor {doc_label} was suspended.",
        )
        case.save(update_fields=["assigned_doctor", "assigned_at", "status", "updated_at"])
    return len(open_cases)


def _validate_question_specs(questions: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if not questions or len(questions) > 30:
        raise ValidationError(
            {"questions": [ErrorDetail("Include between 1 and 30 questions.", code="invalid")]}
        )
    cleaned: list[dict[str, Any]] = []
    for idx, raw in enumerate(questions):
        prompt = normalize_text(str(raw.get("prompt", ""))).strip()
        if not prompt:
            raise ValidationError(
                {
                    f"questions.{idx}.prompt": [
                        ErrorDetail("This field is required.", code="required")
                    ]
                }
            )
        qtype = str(raw.get("question_type", ""))
        options = [
            normalize_text(str(opt)).strip()
            for opt in raw.get("options", [])
            if normalize_text(str(opt)).strip()
        ]
        # Preserve order while deduplicating options.
        deduped_options = list(dict.fromkeys(options))
        if qtype in (Question.Type.SINGLE_CHOICE, Question.Type.MULTI_CHOICE):
            if len(deduped_options) < 2:
                raise ValidationError(
                    {
                        f"questions.{idx}.options": [
                            ErrorDetail("Add at least two distinct choices.", code="invalid")
                        ]
                    }
                )
        else:
            deduped_options = []

        scale_min = int(raw.get("scale_min", 1) or 1)
        scale_max = int(raw.get("scale_max", 5) or 5)
        if qtype == Question.Type.SCALE and not (1 <= scale_min < scale_max <= 10):
            raise ValidationError(
                {
                    f"questions.{idx}.scale_max": [
                        ErrorDetail("Scale range must be between 1 and 10.", code="invalid")
                    ]
                }
            )
        cleaned.append(
            {
                "question_type": qtype,
                "prompt": prompt,
                "help_text": normalize_text(str(raw.get("help_text", ""))).strip(),
                "required": bool(raw.get("required", True)),
                "options": deduped_options,
                "scale_min": scale_min,
                "scale_max": scale_max,
            }
        )
    return cleaned


@transaction.atomic
def send_questions(
    consultation: DoctorConsultation,
    doctor: Doctor,
    *,
    title: str = "",
    note: str = "",
    questions: list[dict[str, Any]],
) -> QuestionSet:
    """Create a follow-up QuestionSet and move the consultation to AWAITING_PATIENT."""
    specs = _validate_question_specs(questions)
    locked = DoctorConsultation.objects.select_for_update().get(
        pk=consultation.pk, assigned_doctor=doctor
    )
    if locked.status == Status.ASSIGNED:
        locked.opened_at = locked.opened_at or timezone.now()
        _move(
            locked,
            Status.IN_REVIEW,
            actor_type="doctor",
            actor_id=str(doctor.pk),
            actor_name=doctor.full_name,
        )
    elif locked.status not in (
        Status.IN_REVIEW,
        Status.AWAITING_PATIENT,
        Status.RESPONDED,
    ):
        raise InvalidConsultationTransition()

    max_round = locked.question_sets.aggregate(m=Max("round_number"))["m"] or 0
    qset = QuestionSet.objects.create(
        consultation=locked,
        created_by=doctor,
        round_number=int(max_round) + 1,
        title=normalize_text(title).strip(),
        note=normalize_text(note).strip(),
    )
    for index, spec in enumerate(specs, start=1):
        Question.objects.create(question_set=qset, sort_order=index, **spec)

    _move(
        locked,
        Status.AWAITING_PATIENT,
        actor_type="doctor",
        actor_id=str(doctor.pk),
        actor_name=doctor.full_name,
        note=qset.title or f"Question round {qset.round_number}",
    )
    locked.save(update_fields=["status", "opened_at", "updated_at"])

    patient_phone = locked.patient.phone
    case_code = locked.consultation_code
    transaction.on_commit(
        lambda: _send_consultation_sms(
            patient_phone,
            f"HomeoHub: Your doctor has follow-up questions for case {case_code}.",
        )
    )
    return qset


def _coerce_yes_no(value: Any) -> bool | None:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        lowered = value.strip().lower()
        if lowered in ("true", "yes", "1"):
            return True
        if lowered in ("false", "no", "0"):
            return False
    return None


@transaction.atomic
def submit_answers(
    question_set: QuestionSet,
    patient: Patient,
    *,
    raw_answers: list[dict[str, Any]],
    files: dict[str, UploadedFile],
) -> QuestionSet:
    """Validate per-question answers, store private photos, and advance case status."""
    locked_case = DoctorConsultation.objects.select_for_update().get(
        pk=question_set.consultation_id, patient=patient
    )
    locked_set = QuestionSet.objects.select_for_update().get(
        pk=question_set.pk, consultation=locked_case
    )
    if locked_set.answered_at is not None:
        raise QuestionSetAlreadyAnswered()

    submitted_by_qid: dict[str, Any] = {}
    for entry in raw_answers:
        if isinstance(entry, dict) and entry.get("question_id"):
            submitted_by_qid[str(entry["question_id"])] = entry.get("value")

    questions = list(locked_set.questions.all().order_by("sort_order", "id"))
    errors: dict[str, list[ErrorDetail]] = {}
    pending_records: list[tuple[Question, Any, tuple[str, str, str] | None]] = []

    for question in questions:
        qid = str(question.pk)
        raw_val = submitted_by_qid.get(qid)
        qtype = question.question_type

        if qtype == Question.Type.PHOTO:
            upload = files.get(f"file_{qid}") or files.get(qid)
            if upload is None:
                if question.required:
                    errors[qid] = [ErrorDetail("Please upload a photo.", code="required")]
                continue
            stored = store_private(
                upload,
                f"consultations/{locked_case.pk}/answers",
                field=qid,
                allowed=("JPEG", "PNG", "WEBP"),
                max_bytes=10 * 1024 * 1024,
            )
            pending_records.append(
                (question, None, (stored.name, str(upload.name or "photo"), stored.content_type))
            )
            continue

        if qtype in (Question.Type.TEXT, Question.Type.LONG_TEXT):
            text = normalize_text(str(raw_val)).strip() if raw_val is not None else ""
            if not text:
                if question.required:
                    errors[qid] = [ErrorDetail("This field is required.", code="required")]
                continue
            max_len = 500 if qtype == Question.Type.TEXT else 4000
            if len(text) > max_len:
                errors[qid] = [ErrorDetail("Answer is too long.", code="max_length")]
                continue
            pending_records.append((question, text, None))
            continue

        if qtype == Question.Type.YES_NO:
            if raw_val is None or raw_val == "":
                if question.required:
                    errors[qid] = [ErrorDetail("Please choose Yes or No.", code="required")]
                continue
            parsed = _coerce_yes_no(raw_val)
            if parsed is None:
                errors[qid] = [ErrorDetail("Choose Yes or No.", code="invalid")]
                continue
            pending_records.append((question, parsed, None))
            continue

        if qtype == Question.Type.SINGLE_CHOICE:
            choice = normalize_text(str(raw_val)).strip() if raw_val is not None else ""
            if not choice:
                if question.required:
                    errors[qid] = [ErrorDetail("Please select an option.", code="required")]
                continue
            if choice not in question.options:
                errors[qid] = [ErrorDetail("Invalid choice.", code="invalid")]
                continue
            pending_records.append((question, choice, None))
            continue

        if qtype == Question.Type.MULTI_CHOICE:
            if raw_val is None or raw_val == []:
                if question.required:
                    errors[qid] = [
                        ErrorDetail("Please select at least one option.", code="required")
                    ]
                continue
            if not isinstance(raw_val, list):
                errors[qid] = [ErrorDetail("Expected a list of choices.", code="invalid")]
                continue
            chosen = list(
                dict.fromkeys(
                    normalize_text(str(item)).strip() for item in raw_val if str(item).strip()
                )
            )
            if not chosen:
                if question.required:
                    errors[qid] = [
                        ErrorDetail("Please select at least one option.", code="required")
                    ]
                continue
            if any(item not in question.options for item in chosen):
                errors[qid] = [ErrorDetail("Contains an invalid choice.", code="invalid")]
                continue
            pending_records.append((question, chosen, None))
            continue

        if qtype == Question.Type.NUMBER:
            if raw_val is None or str(raw_val).strip() == "":
                if question.required:
                    errors[qid] = [ErrorDetail("Enter a number.", code="required")]
                continue
            try:
                num = float(raw_val)
            except (TypeError, ValueError):
                errors[qid] = [ErrorDetail("Enter a valid number.", code="invalid")]
                continue
            if not math.isfinite(num):
                errors[qid] = [ErrorDetail("Enter a finite number.", code="invalid")]
                continue
            final_num: int | float = int(num) if num.is_integer() else num
            pending_records.append((question, final_num, None))
            continue

        if qtype == Question.Type.SCALE:
            if raw_val is None or str(raw_val).strip() == "":
                if question.required:
                    errors[qid] = [ErrorDetail("Choose a rating.", code="required")]
                continue
            try:
                score = int(raw_val)
            except (TypeError, ValueError):
                errors[qid] = [ErrorDetail("Choose a whole number.", code="invalid")]
                continue
            if isinstance(raw_val, bool) or not (question.scale_min <= score <= question.scale_max):
                errors[qid] = [ErrorDetail("Rating out of range.", code="invalid")]
                continue
            pending_records.append((question, score, None))

    if errors:
        raise ValidationError(errors)

    for question, val_json, file_info in pending_records:
        Answer.objects.create(
            question=question,
            value_json=val_json,
            file=file_info[0] if file_info else "",
            file_name=file_info[1] if file_info else "",
            content_type=file_info[2] if file_info else "",
        )

    locked_set.answered_at = timezone.now()
    locked_set.save(update_fields=["answered_at"])

    still_open = locked_case.question_sets.filter(answered_at__isnull=True).exists()
    if not still_open and locked_case.status == Status.AWAITING_PATIENT:
        _move(
            locked_case,
            Status.RESPONDED,
            actor_type="patient",
            actor_id=str(patient.pk),
            actor_name=patient.full_name,
            note=f"Answered round {locked_set.round_number}",
        )
        locked_case.save(update_fields=["status", "updated_at"])

    if locked_case.assigned_doctor:
        doctor_phone = locked_case.assigned_doctor.phone
        case_code = locked_case.consultation_code
        transaction.on_commit(
            lambda: _send_consultation_sms(
                doctor_phone,
                f"HomeoHub: Patient replied to questions for case {case_code}.",
            )
        )

    return locked_set
