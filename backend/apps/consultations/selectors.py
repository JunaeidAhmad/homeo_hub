from dataclasses import dataclass
from uuid import UUID

from django.db.models import BooleanField, Case, Count, IntegerField, Q, QuerySet, Value, When
from django.shortcuts import get_object_or_404

from apps.doctors.models import Doctor
from apps.patients.models import Patient

from .models import DoctorConsultation, QuestionTemplate

AREA_MATCH_ORDER = {"UPAZILA": 0, "DISTRICT": 1, "DIVISION": 2, "OTHER": 3}
_OPEN_STATUSES = (
    DoctorConsultation.Status.SUBMITTED,
    DoctorConsultation.Status.ASSIGNED,
    DoctorConsultation.Status.IN_REVIEW,
    DoctorConsultation.Status.AWAITING_PATIENT,
    DoctorConsultation.Status.RESPONDED,
    DoctorConsultation.Status.PRESCRIBED,
)


@dataclass(frozen=True)
class AssignableDoctorRow:
    doctor: Doctor
    area_match: str
    open_case_count: int


def consultations_for_patient(patient: Patient) -> QuerySet[DoctorConsultation]:
    return (
        DoctorConsultation.objects.filter(patient=patient)
        .select_related("illness", "illness__category", "assigned_doctor", "invoice")
        .prefetch_related("categories", "history", "question_sets__questions__answer")
    )


def admin_consultations(*, status: str = "") -> QuerySet[DoctorConsultation]:
    qs = (
        DoctorConsultation.objects.select_related(
            "patient",
            "patient__location",
            "illness",
            "illness__category",
            "assigned_doctor",
        )
        .prefetch_related("categories", "history")
        .all()
    )
    if status:
        qs = qs.filter(status=status)
    return qs


def cases_for_doctor(
    doctor: Doctor, *, status: str = "", q: str = ""
) -> QuerySet[DoctorConsultation]:
    qs = (
        DoctorConsultation.objects.filter(assigned_doctor=doctor)
        .select_related(
            "patient",
            "patient__location",
            "patient__profile",
            "illness",
            "illness__category",
        )
        .prefetch_related("categories", "history", "question_sets__questions__answer")
    )
    if status:
        qs = qs.filter(status=status)
    if q.strip():
        needle = q.strip()
        qs = qs.filter(
            Q(consultation_code__icontains=needle)
            | Q(chief_complaint__icontains=needle)
            | Q(patient__full_name__icontains=needle)
        )
    priority = Case(
        When(status=DoctorConsultation.Status.RESPONDED, then=Value(0)),
        When(status=DoctorConsultation.Status.ASSIGNED, then=Value(1)),
        When(status=DoctorConsultation.Status.IN_REVIEW, then=Value(2)),
        When(status=DoctorConsultation.Status.AWAITING_PATIENT, then=Value(3)),
        When(status=DoctorConsultation.Status.PRESCRIBED, then=Value(4)),
        default=Value(5),
        output_field=IntegerField(),
    )
    return qs.order_by(priority, "-submitted_at")


def patient_for_doctor(doctor: Doctor, patient_id: str) -> Patient:
    has_case = DoctorConsultation.objects.filter(
        assigned_doctor=doctor, patient_id=patient_id
    ).exists()
    if not has_case:
        return get_object_or_404(Patient.objects.none())
    return get_object_or_404(Patient.objects.select_related("location", "profile"), pk=patient_id)


def patient_history_with_doctor(
    doctor: Doctor, patient: Patient, *, exclude_id: UUID | None = None
) -> QuerySet[DoctorConsultation]:
    qs = DoctorConsultation.objects.filter(assigned_doctor=doctor, patient=patient).order_by(
        "-submitted_at"
    )
    if exclude_id is not None:
        qs = qs.exclude(pk=exclude_id)
    return qs


def assignable_doctors(
    *, q: str = "", consultation: DoctorConsultation | None = None
) -> list[AssignableDoctorRow]:
    qs = (
        Doctor.objects.filter(status=Doctor.Status.APPROVED)
        .select_related("location")
        .annotate(
            open_case_count=Count(
                "consultations",
                filter=Q(consultations__status__in=_OPEN_STATUSES),
            )
        )
    )
    if q.strip():
        needle = q.strip()
        qs = qs.filter(
            Q(full_name__icontains=needle)
            | Q(doctor_code__icontains=needle)
            | Q(registration_no__icontains=needle)
            | Q(location__upazila_en__icontains=needle)
            | Q(location__upazila_bn__icontains=needle)
            | Q(location__district_en__icontains=needle)
            | Q(location__district_bn__icontains=needle)
            | Q(location__division_en__icontains=needle)
            | Q(location__division_bn__icontains=needle)
        )

    target_loc = consultation.patient.location if consultation else None
    rows: list[AssignableDoctorRow] = []
    for doc in qs:
        if target_loc is None:
            match = "OTHER"
        else:
            loc = doc.location
            if loc.pk == target_loc.pk:
                match = "UPAZILA"
            elif (
                loc.district_en == target_loc.district_en
                and loc.division_en == target_loc.division_en
            ):
                match = "DISTRICT"
            elif loc.division_en == target_loc.division_en:
                match = "DIVISION"
            else:
                match = "OTHER"
        rows.append(
            AssignableDoctorRow(
                doctor=doc,
                area_match=match,
                open_case_count=int(getattr(doc, "open_case_count", 0)),
            )
        )

    rows.sort(
        key=lambda row: (
            AREA_MATCH_ORDER[row.area_match],
            row.open_case_count,
            row.doctor.full_name.lower(),
        )
    )
    return rows


def admin_question_templates(
    *, status: str = "", category_id: str = ""
) -> QuerySet[QuestionTemplate]:
    qs = QuestionTemplate.objects.prefetch_related("categories").all()
    if status:
        qs = qs.filter(status=status)
    if category_id:
        qs = qs.filter(categories__id=category_id).distinct()
    return qs


def suggested_question_templates(
    consultation: DoctorConsultation, *, q: str = ""
) -> QuerySet[QuestionTemplate]:
    case_cat_ids = list(consultation.categories.values_list("pk", flat=True))
    qs = QuestionTemplate.objects.filter(status=QuestionTemplate.Status.ACTIVE).prefetch_related(
        "categories"
    )
    if q.strip():
        needle = q.strip()
        qs = qs.filter(Q(text_en__icontains=needle) | Q(text_bn__icontains=needle))
    match_expr: Count | Value
    if case_cat_ids:
        match_expr = Count(
            "categories",
            filter=Q(categories__id__in=case_cat_ids),
            distinct=True,
        )
    else:
        match_expr = Value(0, output_field=IntegerField())
    return (
        qs.annotate(match_count=match_expr)
        .annotate(
            matches=Case(
                When(match_count__gt=0, then=Value(True)),
                default=Value(False),
                output_field=BooleanField(),
            )
        )
        .order_by("-match_count", "-use_count", "text_en", "id")
    )
