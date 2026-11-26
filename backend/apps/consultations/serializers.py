from typing import Any

from rest_framework import serializers

from apps.doctors.models import Doctor
from apps.illnesses.models import Illness
from common.serializers import LocalizedField

from .models import ConsultationStatusHistory, DoctorConsultation


class ConsultationIllnessSerializer(serializers.ModelSerializer):
    name = LocalizedField()

    class Meta:
        model = Illness
        fields = ["id", "slug", "name"]
        read_only_fields = fields


class ConsultationDoctorSummarySerializer(serializers.ModelSerializer):
    class Meta:
        model = Doctor
        fields = ["id", "doctor_code", "full_name", "qualifications"]
        read_only_fields = fields


class ConsultationHistorySerializer(serializers.ModelSerializer):
    class Meta:
        model = ConsultationStatusHistory
        fields = [
            "id",
            "from_status",
            "to_status",
            "actor_type",
            "actor_name",
            "note",
            "created_at",
        ]
        read_only_fields = fields


class PatientConsultationSummarySerializer(serializers.ModelSerializer):
    doctor_name = serializers.SerializerMethodField()

    class Meta:
        model = DoctorConsultation
        fields = [
            "id",
            "consultation_code",
            "chief_complaint",
            "urgency",
            "status",
            "doctor_name",
            "submitted_at",
            "updated_at",
        ]
        read_only_fields = fields

    def get_doctor_name(self, obj: DoctorConsultation) -> str | None:
        return obj.assigned_doctor.full_name if obj.assigned_doctor else None


class PatientConsultationDetailSerializer(serializers.ModelSerializer):
    illness = ConsultationIllnessSerializer(read_only=True)
    doctor = ConsultationDoctorSummarySerializer(source="assigned_doctor", read_only=True)
    history = ConsultationHistorySerializer(many=True, read_only=True)

    class Meta:
        model = DoctorConsultation
        fields = [
            "id",
            "consultation_code",
            "chief_complaint",
            "symptoms",
            "duration_value",
            "duration_unit",
            "symptom_notes",
            "urgency",
            "status",
            "illness",
            "doctor",
            "submitted_at",
            "assigned_at",
            "opened_at",
            "closed_at",
            "cancelled_at",
            "cancel_reason",
            "updated_at",
            "history",
        ]
        read_only_fields = fields


class ConsultationSubmitSerializer(serializers.Serializer):
    illness_id = serializers.PrimaryKeyRelatedField(
        source="illness",
        queryset=Illness.objects.filter(status=Illness.Status.ACTIVE),
        pk_field=serializers.UUIDField(),
        required=False,
        allow_null=True,
    )
    chief_complaint = serializers.CharField(max_length=200)
    symptoms = serializers.CharField(max_length=4000)
    duration_value = serializers.IntegerField(
        min_value=1, max_value=200, required=False, allow_null=True
    )
    duration_unit = serializers.ChoiceField(
        choices=DoctorConsultation.DurationUnit.choices,
        required=False,
        allow_blank=True,
        default="",
    )
    symptom_notes = serializers.CharField(
        max_length=4000, required=False, allow_blank=True, default=""
    )
    urgency = serializers.ChoiceField(
        choices=DoctorConsultation.Urgency.choices,
        default=DoctorConsultation.Urgency.ROUTINE,
    )


class ConsultationWithdrawSerializer(serializers.Serializer):
    reason = serializers.CharField(max_length=300, required=False, allow_blank=True, default="")


class AdminConsultationPatientSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    full_name = serializers.CharField()
    phone = serializers.CharField()
    age = serializers.IntegerField()
    gender = serializers.CharField()
    area = serializers.SerializerMethodField()

    def get_area(self, obj: Any) -> str:
        return obj.location.display_name_en


class AdminConsultationSummarySerializer(serializers.ModelSerializer):
    patient_name = serializers.CharField(source="patient.full_name", read_only=True)
    area = serializers.CharField(source="patient.location.display_name_en", read_only=True)
    doctor_name = serializers.SerializerMethodField()

    class Meta:
        model = DoctorConsultation
        fields = [
            "id",
            "consultation_code",
            "patient_name",
            "area",
            "chief_complaint",
            "urgency",
            "status",
            "doctor_name",
            "submitted_at",
        ]
        read_only_fields = fields

    def get_doctor_name(self, obj: DoctorConsultation) -> str | None:
        return obj.assigned_doctor.full_name if obj.assigned_doctor else None


class AdminConsultationDetailSerializer(serializers.ModelSerializer):
    patient = AdminConsultationPatientSerializer(read_only=True)
    illness = ConsultationIllnessSerializer(read_only=True)
    doctor = ConsultationDoctorSummarySerializer(source="assigned_doctor", read_only=True)
    history = ConsultationHistorySerializer(many=True, read_only=True)

    class Meta:
        model = DoctorConsultation
        fields = [
            "id",
            "consultation_code",
            "patient",
            "illness",
            "chief_complaint",
            "symptoms",
            "duration_value",
            "duration_unit",
            "symptom_notes",
            "urgency",
            "status",
            "doctor",
            "submitted_at",
            "assigned_at",
            "opened_at",
            "closed_at",
            "cancelled_at",
            "cancel_reason",
            "history",
        ]
        read_only_fields = fields
