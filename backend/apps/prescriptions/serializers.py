from typing import Any

from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from apps.billing.models import ConsultationInvoice
from apps.consultations.models import DoctorConsultation
from apps.doctors.models import Doctor
from apps.remedies.choices import Potency, RemedyForm
from apps.remedies.models import Remedy

from .models import Prescription, PrescriptionAdvice, PrescriptionItem


class PrescriptionDoctorSerializer(serializers.ModelSerializer):
    class Meta:
        model = Doctor
        fields = ["id", "doctor_code", "full_name", "registration_no", "qualifications"]
        read_only_fields = fields


class ConsultationInvoiceSerializer(serializers.ModelSerializer):
    class Meta:
        model = ConsultationInvoice
        fields = [
            "id",
            "doctor_fee_poisha",
            "platform_fee_poisha",
            "total_poisha",
            "status",
        ]
        read_only_fields = fields


class PrescriptionAdviceSerializer(serializers.ModelSerializer):
    class Meta:
        model = PrescriptionAdvice
        fields = ["id", "kind", "text", "position"]
        read_only_fields = fields


class DoctorPrescriptionItemSerializer(serializers.ModelSerializer):
    remedy_id = serializers.UUIDField(allow_null=True, read_only=True)
    remedy_name_bn = serializers.SerializerMethodField()
    is_catalog = serializers.SerializerMethodField()

    class Meta:
        model = PrescriptionItem
        fields = [
            "id",
            "position",
            "remedy_id",
            "remedy_name",
            "remedy_name_bn",
            "is_catalog",
            "potency",
            "form",
            "dosage",
            "frequency",
            "duration",
        ]
        read_only_fields = fields

    def get_remedy_name_bn(self, item: PrescriptionItem) -> str:
        return item.remedy.name_bn if item.remedy else ""

    def get_is_catalog(self, item: PrescriptionItem) -> bool:
        return item.remedy_id is not None


class DoctorPrescriptionDetailSerializer(serializers.ModelSerializer):
    previous_id = serializers.UUIDField(allow_null=True, read_only=True)
    items = DoctorPrescriptionItemSerializer(many=True, read_only=True)
    advice = PrescriptionAdviceSerializer(many=True, read_only=True)

    class Meta:
        model = Prescription
        fields = [
            "id",
            "version",
            "previous_id",
            "status",
            "report_after_date",
            "doctor_notes",
            "issued_at",
            "items",
            "advice",
        ]
        read_only_fields = fields


class DoctorPrescriptionVersionSerializer(serializers.ModelSerializer):
    previous_id = serializers.UUIDField(allow_null=True, read_only=True)
    previous_version = serializers.SerializerMethodField()
    item_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Prescription
        fields = [
            "id",
            "version",
            "previous_id",
            "previous_version",
            "status",
            "issued_at",
            "item_count",
        ]
        read_only_fields = fields

    def get_previous_version(self, obj: Prescription) -> int | None:
        return obj.previous.version if obj.previous else None


class DoctorPrescriptionWorkspaceSerializer(serializers.Serializer):
    consultation_status = serializers.ChoiceField(choices=DoctorConsultation.Status.choices)
    doctor = PrescriptionDoctorSerializer()
    latest = DoctorPrescriptionDetailSerializer(allow_null=True)
    versions = DoctorPrescriptionVersionSerializer(many=True)


class PrescriptionItemInputSerializer(serializers.Serializer):
    remedy_id = serializers.UUIDField(required=False, allow_null=True)
    remedy_name = serializers.CharField(
        max_length=150, required=False, allow_blank=True, default=""
    )
    potency = serializers.ChoiceField(choices=Potency.choices)
    form = serializers.ChoiceField(choices=RemedyForm.choices)
    dosage = serializers.CharField(max_length=100)
    frequency = serializers.CharField(max_length=100)
    duration = serializers.CharField(max_length=100)


class PrescriptionAdviceInputSerializer(serializers.Serializer):
    kind = serializers.ChoiceField(choices=PrescriptionAdvice.Kind.choices)
    text = serializers.CharField(max_length=300)


class PrescriptionIssueSerializer(serializers.Serializer):
    items = PrescriptionItemInputSerializer(many=True)
    advice = PrescriptionAdviceInputSerializer(many=True, required=False, default=list)
    report_after_date = serializers.DateField(required=False, allow_null=True, default=None)
    doctor_notes = serializers.CharField(
        max_length=5000, required=False, allow_blank=True, default=""
    )


class LockedPrescriptionSummarySerializer(serializers.Serializer):
    doctor_name = serializers.CharField()
    issued_at = serializers.DateTimeField()
    remedy_count = serializers.IntegerField()


class LockedPrescriptionSerializer(serializers.Serializer):
    """Strict locked view: never touches items, advice, or doctor_notes."""

    locked = serializers.BooleanField(default=True)
    summary = LockedPrescriptionSummarySerializer()
    invoice = ConsultationInvoiceSerializer()


def _active_price_info(item: PrescriptionItem) -> tuple[bool, int | None, str | None]:
    remedy = item.remedy
    if remedy is None:
        return False, None, "NOT_LISTED"
    if remedy.status != Remedy.Status.ACTIVE:
        return False, None, "NO_PRICE"
    for price in remedy.prices.all():
        if price.form == item.form and price.is_active:
            return True, price.price_poisha, None
    return False, None, "NO_PRICE"


class PatientPrescriptionItemSerializer(serializers.ModelSerializer):
    remedy_id = serializers.UUIDField(allow_null=True, read_only=True)
    remedy_name_bn = serializers.SerializerMethodField()
    remedy_slug = serializers.SerializerMethodField()
    is_catalog = serializers.SerializerMethodField()
    buyable = serializers.SerializerMethodField()
    unit_price_poisha = serializers.SerializerMethodField()
    unavailable_reason = serializers.SerializerMethodField()

    class Meta:
        model = PrescriptionItem
        fields = [
            "id",
            "position",
            "remedy_id",
            "remedy_name",
            "remedy_name_bn",
            "remedy_slug",
            "is_catalog",
            "potency",
            "form",
            "dosage",
            "frequency",
            "duration",
            "buyable",
            "unit_price_poisha",
            "unavailable_reason",
        ]
        read_only_fields = fields

    def get_remedy_name_bn(self, item: PrescriptionItem) -> str:
        return item.remedy.name_bn if item.remedy else ""

    def get_remedy_slug(self, item: PrescriptionItem) -> str | None:
        return item.remedy.slug if item.remedy else None

    def get_is_catalog(self, item: PrescriptionItem) -> bool:
        return item.remedy_id is not None

    def get_buyable(self, item: PrescriptionItem) -> bool:
        return _active_price_info(item)[0]

    @extend_schema_field({"type": "integer", "nullable": True})
    def get_unit_price_poisha(self, item: PrescriptionItem) -> int | None:
        return _active_price_info(item)[1]

    @extend_schema_field({"type": "string", "enum": ["NOT_LISTED", "NO_PRICE"], "nullable": True})
    def get_unavailable_reason(self, item: PrescriptionItem) -> str | None:
        return _active_price_info(item)[2]


class PatientPrescriptionDetailSerializer(serializers.ModelSerializer):
    doctor = PrescriptionDoctorSerializer(read_only=True)
    items = PatientPrescriptionItemSerializer(many=True, read_only=True)
    advice = PrescriptionAdviceSerializer(many=True, read_only=True)

    class Meta:
        model = Prescription
        fields = [
            "id",
            "doctor",
            "version",
            "issued_at",
            "report_after_date",
            "items",
            "advice",
        ]
        read_only_fields = fields


class UnlockedPrescriptionSerializer(serializers.Serializer):
    locked = serializers.BooleanField(default=False)
    prescription = PatientPrescriptionDetailSerializer()
    invoice = ConsultationInvoiceSerializer()


def build_locked_payload(
    prescription: Prescription,
    invoice: ConsultationInvoice,
) -> dict[str, Any]:
    return {
        "locked": True,
        "summary": {
            "doctor_name": prescription.doctor.full_name,
            "issued_at": prescription.issued_at,
            "remedy_count": getattr(prescription, "remedy_count", None)
            or prescription.items.count(),
        },
        "invoice": invoice,
    }
