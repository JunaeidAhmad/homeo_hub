"""Invoice lifecycle: creation on prescription issue and voiding on withdrawal."""

from apps.consultations.models import DoctorConsultation
from apps.prescriptions.models import Prescription

from .fees import platform_fee_for
from .models import ConsultationInvoice


def create_invoice_for_prescription(
    consultation: DoctorConsultation,
    prescription: Prescription,
) -> ConsultationInvoice:
    """Snapshot the doctor and platform fees into a new UNPAID invoice."""
    doctor = consultation.assigned_doctor
    doctor_fee = 0
    if doctor is not None:
        doctor_fee = int(doctor.consultation_fee_poisha or doctor.requested_fee_poisha or 0)
    platform_fee = platform_fee_for(doctor_fee)
    return ConsultationInvoice.objects.create(
        consultation=consultation,
        prescription=prescription,
        doctor_fee_poisha=doctor_fee,
        platform_fee_poisha=platform_fee,
        total_poisha=doctor_fee + platform_fee,
        status=ConsultationInvoice.Status.UNPAID,
    )


def void_unpaid_invoice(consultation: DoctorConsultation) -> None:
    """Void an unpaid invoice when a consultation is withdrawn."""
    ConsultationInvoice.objects.filter(
        consultation=consultation,
        status=ConsultationInvoice.Status.UNPAID,
    ).update(status=ConsultationInvoice.Status.VOID)
