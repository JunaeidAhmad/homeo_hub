from django.utils import timezone
from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from .models import ConsultationInvoice


class AdminInvoiceSerializer(serializers.ModelSerializer):
    consultation_id = serializers.UUIDField(read_only=True)
    consultation_code = serializers.CharField(
        source="consultation.consultation_code", read_only=True
    )
    patient_name = serializers.CharField(source="consultation.patient.full_name", read_only=True)
    patient_phone = serializers.CharField(source="consultation.patient.phone", read_only=True)
    doctor_name = serializers.SerializerMethodField()
    days_unpaid = serializers.SerializerMethodField()
    waived_by_name = serializers.SerializerMethodField()
    closed_by_name = serializers.SerializerMethodField()

    class Meta:
        model = ConsultationInvoice
        fields = [
            "id",
            "consultation_id",
            "consultation_code",
            "patient_name",
            "patient_phone",
            "doctor_name",
            "doctor_fee_poisha",
            "platform_fee_poisha",
            "total_poisha",
            "status",
            "days_unpaid",
            "paid_at",
            "waived_at",
            "waived_by_name",
            "waive_reason",
            "closed_at",
            "closed_by_name",
            "close_reason",
            "created_at",
        ]
        read_only_fields = fields

    def get_doctor_name(self, invoice: ConsultationInvoice) -> str | None:
        doc = invoice.consultation.assigned_doctor or invoice.prescription.doctor
        return doc.full_name if doc else None

    @extend_schema_field({"type": "integer", "nullable": True})
    def get_days_unpaid(self, invoice: ConsultationInvoice) -> int | None:
        if invoice.status != ConsultationInvoice.Status.UNPAID:
            return None
        delta = timezone.now() - invoice.created_at
        return max(0, int(delta.days))

    def get_waived_by_name(self, invoice: ConsultationInvoice) -> str | None:
        if invoice.waived_by:
            return invoice.waived_by.get_full_name() or invoice.waived_by.username
        return None

    def get_closed_by_name(self, invoice: ConsultationInvoice) -> str | None:
        if invoice.closed_by:
            return invoice.closed_by.get_full_name() or invoice.closed_by.username
        return None


class AdminInvoiceReasonSerializer(serializers.Serializer):
    reason = serializers.CharField(max_length=300, allow_blank=False)
