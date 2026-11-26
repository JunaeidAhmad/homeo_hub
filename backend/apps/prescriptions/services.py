"""Issuing and correcting doctor prescriptions."""

from datetime import date
from typing import Any

from django.db import transaction
from rest_framework.exceptions import ErrorDetail, ValidationError

from apps.billing.services import create_invoice_for_prescription
from apps.consultations.models import DoctorConsultation
from apps.consultations.services import InvalidConsultationTransition, move_to_prescribed
from apps.doctors.models import Doctor
from apps.remedies.models import Remedy
from common.errors import ApiError
from common.search import normalize_text

from .models import Prescription, PrescriptionAdvice, PrescriptionItem

Status = DoctorConsultation.Status

MAX_ITEMS = 15
MAX_ADVICE = 30


class NotAssignedDoctor(ApiError):
    status_code = 403
    error_code = "NOT_ASSIGNED_DOCTOR"
    default_detail = "Only the assigned doctor can prescribe for this case."


def _validate_items(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if not items or len(items) > MAX_ITEMS:
        raise ValidationError(
            {"items": [ErrorDetail(f"Include between 1 and {MAX_ITEMS} remedies.", code="invalid")]}
        )

    cleaned: list[dict[str, Any]] = []
    remedy_ids = [item["remedy_id"] for item in items if item.get("remedy_id")]
    remedies_by_id = {
        remedy.pk: remedy
        for remedy in Remedy.objects.filter(pk__in=remedy_ids, status=Remedy.Status.ACTIVE)
    }

    errors: dict[str, list[ErrorDetail]] = {}
    for idx, raw in enumerate(items):
        remedy_id = raw.get("remedy_id")
        remedy_obj: Remedy | None = None
        if remedy_id:
            remedy_obj = remedies_by_id.get(remedy_id)
            if remedy_obj is None:
                errors[f"items.{idx}.remedy_id"] = [
                    ErrorDetail("Choose an active remedy from the catalogue.", code="invalid")
                ]
                continue
            remedy_name = remedy_obj.name
        else:
            remedy_name = normalize_text(str(raw.get("remedy_name", ""))).strip()
            if not remedy_name:
                errors[f"items.{idx}.remedy_name"] = [
                    ErrorDetail("Choose a remedy or enter a remedy name.", code="required")
                ]
                continue
            if len(remedy_name) > 150:
                errors[f"items.{idx}.remedy_name"] = [
                    ErrorDetail("Remedy name is too long.", code="max_length")
                ]
                continue

        item_spec: dict[str, Any] = {
            "remedy": remedy_obj,
            "remedy_name": remedy_name,
            "potency": str(raw["potency"]),
            "form": str(raw["form"]),
        }
        for field in ("dosage", "frequency", "duration"):
            val = normalize_text(str(raw.get(field, ""))).strip()
            if not val:
                errors[f"items.{idx}.{field}"] = [
                    ErrorDetail("This field is required.", code="required")
                ]
            elif len(val) > 100:
                errors[f"items.{idx}.{field}"] = [
                    ErrorDetail("Keep this under 100 characters.", code="max_length")
                ]
            else:
                item_spec[field] = val
        if all(field in item_spec for field in ("dosage", "frequency", "duration")):
            cleaned.append(item_spec)

    if errors:
        raise ValidationError(errors)
    return cleaned


def _validate_advice(advice: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if len(advice) > MAX_ADVICE:
        raise ValidationError(
            {
                "advice": [
                    ErrorDetail(f"Keep advice to {MAX_ADVICE} lines or fewer.", code="invalid")
                ]
            }
        )
    seen: set[tuple[str, str]] = set()
    cleaned: list[dict[str, Any]] = []
    for raw in advice:
        kind = str(raw["kind"])
        text = normalize_text(str(raw.get("text", ""))).strip()
        if not text:
            continue
        if len(text) > 300:
            raise ValidationError(
                {
                    "advice": [
                        ErrorDetail(
                            "Each advice line must be 300 characters or less.",
                            code="max_length",
                        )
                    ]
                }
            )
        key = (kind, text.casefold())
        if key in seen:
            continue
        seen.add(key)
        cleaned.append({"kind": kind, "text": text})
    return cleaned


@transaction.atomic
def issue_prescription(
    consultation: DoctorConsultation,
    doctor: Doctor,
    *,
    items: list[dict[str, Any]],
    advice: list[dict[str, Any]],
    report_after_date: date | None = None,
    doctor_notes: str = "",
) -> Prescription:
    """Issue version 1 (creating the invoice) or issue a correction version n+1."""
    cleaned_items = _validate_items(items)
    cleaned_advice = _validate_advice(advice)
    cleaned_notes = normalize_text(doctor_notes).strip()

    locked = DoctorConsultation.objects.select_for_update().get(pk=consultation.pk)
    if locked.assigned_doctor_id != doctor.pk:
        raise NotAssignedDoctor()

    existing_active = (
        Prescription.objects.select_for_update()
        .filter(consultation=locked, status=Prescription.Status.ACTIVE)
        .first()
    )

    if existing_active is None:
        # First issue: must be under doctor review (or assigned/responded/awaiting).
        if locked.status not in (
            Status.ASSIGNED,
            Status.IN_REVIEW,
            Status.AWAITING_PATIENT,
            Status.RESPONDED,
        ):
            raise InvalidConsultationTransition()
        prescription = Prescription.objects.create(
            consultation=locked,
            doctor=doctor,
            version=1,
            previous=None,
            status=Prescription.Status.ACTIVE,
            report_after_date=report_after_date,
            doctor_notes=cleaned_notes,
        )
        create_invoice_for_prescription(locked, prescription)
        move_to_prescribed(
            locked,
            doctor=doctor,
            note=f"Issued prescription v{prescription.version}",
        )
    else:
        if locked.status not in (Status.PRESCRIBED, Status.COMPLETED):
            raise InvalidConsultationTransition()
        existing_active.status = Prescription.Status.SUPERSEDED
        existing_active.save(update_fields=["status"])
        prescription = Prescription.objects.create(
            consultation=locked,
            doctor=doctor,
            version=existing_active.version + 1,
            previous=existing_active,
            status=Prescription.Status.ACTIVE,
            report_after_date=report_after_date,
            doctor_notes=cleaned_notes,
        )

    for position, spec in enumerate(cleaned_items, start=1):
        PrescriptionItem.objects.create(
            prescription=prescription,
            position=position,
            **spec,
        )

    for kind in (PrescriptionAdvice.Kind.DO, PrescriptionAdvice.Kind.DONT):
        pos = 1
        for entry in cleaned_advice:
            if entry["kind"] == kind:
                PrescriptionAdvice.objects.create(
                    prescription=prescription,
                    kind=kind,
                    text=entry["text"],
                    position=pos,
                )
                pos += 1

    return prescription
