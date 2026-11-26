"""Invoice lifecycle: creation, voiding, waiving, and closing unpaid."""

from django.contrib.auth.models import User
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ErrorDetail, ValidationError

from apps.consultations.models import DoctorConsultation
from apps.consultations.services import move_to_closed_unpaid, move_to_completed
from apps.prescriptions.models import Prescription
from common.errors import ApiError
from common.search import normalize_text

from .fees import platform_fee_for
from .models import ConsultationInvoice


class InvoiceNotUnpaid(ApiError):
    status_code = 409
    error_code = "INVOICE_NOT_UNPAID"
    default_detail = "Only unpaid invoices can be waived or closed."


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


def _clean_reason(reason: str) -> str:
    clean = normalize_text(reason).strip()
    if not clean:
        raise ValidationError({"reason": [ErrorDetail("Enter a reason.", code="required")]})
    return clean[:300]


@transaction.atomic
def waive_invoice(
    invoice: ConsultationInvoice,
    staff_user: User,
    reason: str,
) -> ConsultationInvoice:
    """Waive an unpaid invoice, unlocking the prescription and completing the consultation."""
    clean_reason = _clean_reason(reason)
    locked = ConsultationInvoice.objects.select_for_update().get(pk=invoice.pk)
    locked_case = DoctorConsultation.objects.select_for_update().get(pk=locked.consultation_id)
    if locked.status != ConsultationInvoice.Status.UNPAID:
        raise InvoiceNotUnpaid()

    locked.status = ConsultationInvoice.Status.WAIVED
    locked.waived_by = staff_user
    locked.waived_at = timezone.now()
    locked.waive_reason = clean_reason
    locked.save(update_fields=["status", "waived_by", "waived_at", "waive_reason", "updated_at"])

    actor_name = staff_user.get_full_name() or staff_user.username
    move_to_completed(
        locked_case,
        actor_type="staff",
        actor_id=str(staff_user.pk),
        actor_name=actor_name,
        note=f"Fee waived: {clean_reason}",
    )
    return locked


@transaction.atomic
def close_invoice(
    invoice: ConsultationInvoice,
    staff_user: User,
    reason: str,
) -> ConsultationInvoice:
    """Close an unpaid invoice by hand and move the consultation to CLOSED_UNPAID."""
    clean_reason = _clean_reason(reason)
    locked = ConsultationInvoice.objects.select_for_update().get(pk=invoice.pk)
    locked_case = DoctorConsultation.objects.select_for_update().get(pk=locked.consultation_id)
    if locked.status != ConsultationInvoice.Status.UNPAID:
        raise InvoiceNotUnpaid()

    locked.status = ConsultationInvoice.Status.CLOSED
    locked.closed_by = staff_user
    locked.closed_at = timezone.now()
    locked.close_reason = clean_reason
    locked.save(update_fields=["status", "closed_by", "closed_at", "close_reason", "updated_at"])

    move_to_closed_unpaid(
        locked_case,
        staff_user=staff_user,
        note=f"Closed unpaid: {clean_reason}",
    )
    return locked
