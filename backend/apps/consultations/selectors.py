from django.db.models import QuerySet

from apps.patients.models import Patient

from .models import DoctorConsultation


def consultations_for_patient(patient: Patient) -> QuerySet[DoctorConsultation]:
    return (
        DoctorConsultation.objects.filter(patient=patient)
        .select_related("illness", "illness__category", "assigned_doctor")
        .prefetch_related("history")
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
        .prefetch_related("history")
        .all()
    )
    if status:
        qs = qs.filter(status=status)
    return qs
