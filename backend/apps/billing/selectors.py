"""Read helpers for consultation billing."""

from apps.consultations.models import DoctorConsultation

from .models import ConsultationInvoice


def is_unlocked(consultation: DoctorConsultation) -> bool:
    """True once the consultation's invoice has been paid or waived."""
    invoice = ConsultationInvoice.objects.filter(consultation=consultation).only("status").first()
    if invoice is None:
        return False
    return invoice.status in (
        ConsultationInvoice.Status.PAID,
        ConsultationInvoice.Status.WAIVED,
    )
