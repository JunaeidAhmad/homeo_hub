"""Query helpers for prescriptions."""

from django.db.models import Count, QuerySet

from apps.consultations.models import DoctorConsultation

from .models import Prescription


def active_prescription(consultation: DoctorConsultation) -> Prescription | None:
    return (
        Prescription.objects.filter(
            consultation=consultation,
            status=Prescription.Status.ACTIVE,
        )
        .select_related("doctor", "previous")
        .prefetch_related("items__remedy__prices", "advice")
        .first()
    )


def active_prescription_header(consultation: DoctorConsultation) -> Prescription | None:
    """Fetch only the active prescription header (no items/advice prefetched) for locked views."""
    return (
        Prescription.objects.filter(
            consultation=consultation,
            status=Prescription.Status.ACTIVE,
        )
        .select_related("doctor")
        .annotate(remedy_count=Count("items"))
        .first()
    )


def prescription_versions(consultation: DoctorConsultation) -> QuerySet[Prescription]:
    return (
        Prescription.objects.filter(consultation=consultation)
        .select_related("previous")
        .annotate(item_count=Count("items"))
        .order_by("-version", "-issued_at")
    )
