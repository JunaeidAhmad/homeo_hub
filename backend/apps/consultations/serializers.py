from typing import Any

from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from apps.doctors.models import Doctor
from apps.illnesses.models import Illness
from apps.locations.models import Location
from apps.locations.serializers import LocationSerializer
from apps.patients.models import Patient, PatientProfile
from common.i18n import localized_text
from common.private_files import signed_link
from common.serializers import LocalizedField

from . import selectors
from .models import Answer, ConsultationStatusHistory, DoctorConsultation, Question, QuestionSet


def _area_label(location: Location) -> str:
    return ", ".join(
        localized_text(location, level) for level in ("upazila", "district", "division")
    )


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


class AnswerSerializer(serializers.ModelSerializer):
    value = serializers.JSONField(source="value_json", read_only=True)
    file_url = serializers.SerializerMethodField()

    class Meta:
        model = Answer
        fields = ["value", "file_url", "file_name", "answered_at"]
        read_only_fields = fields

    @extend_schema_field({"type": "string", "format": "uri", "nullable": True})
    def get_file_url(self, obj: Answer) -> str | None:
        if not obj.file:
            return None
        request = self.context.get("request")
        return signed_link(request, obj.file) if request else None


class QuestionSerializer(serializers.ModelSerializer):
    options = serializers.ListField(child=serializers.CharField(), read_only=True)
    answer = serializers.SerializerMethodField()

    class Meta:
        model = Question
        fields = [
            "id",
            "sort_order",
            "question_type",
            "prompt",
            "help_text",
            "required",
            "options",
            "scale_min",
            "scale_max",
            "answer",
        ]
        read_only_fields = fields

    @extend_schema_field(AnswerSerializer(allow_null=True))
    def get_answer(self, obj: Question) -> dict[str, Any] | None:
        answer = getattr(obj, "answer", None)
        if answer is None:
            return None
        return dict(AnswerSerializer(answer, context=self.context).data)


class QuestionSetSerializer(serializers.ModelSerializer):
    questions = QuestionSerializer(many=True, read_only=True)

    class Meta:
        model = QuestionSet
        fields = ["id", "round_number", "title", "note", "sent_at", "answered_at", "questions"]
        read_only_fields = fields


class QuestionCreateInputSerializer(serializers.ModelSerializer):
    prompt = serializers.CharField(max_length=1000)
    options = serializers.ListField(
        child=serializers.CharField(max_length=200), required=False, default=list
    )
    scale_min = serializers.IntegerField(min_value=1, max_value=9, required=False, default=1)
    scale_max = serializers.IntegerField(min_value=2, max_value=10, required=False, default=5)

    class Meta:
        model = Question
        fields = [
            "question_type",
            "prompt",
            "help_text",
            "required",
            "options",
            "scale_min",
            "scale_max",
        ]
        extra_kwargs = {
            "help_text": {"max_length": 300, "required": False, "allow_blank": True, "default": ""},
            "required": {"required": False, "default": True},
        }


class QuestionSetCreateSerializer(serializers.Serializer):
    title = serializers.CharField(max_length=160, required=False, allow_blank=True, default="")
    note = serializers.CharField(max_length=1000, required=False, allow_blank=True, default="")
    questions = QuestionCreateInputSerializer(many=True)


class QuestionAnswerInputSerializer(serializers.Serializer):
    question_id = serializers.UUIDField()
    value = serializers.JSONField(required=False, allow_null=True)


class AnswerBatchSubmitSerializer(serializers.Serializer):
    answers = QuestionAnswerInputSerializer(many=True)


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


class PatientPrescriptionBannerSerializer(serializers.Serializer):
    issued_at = serializers.DateTimeField()
    remedy_count = serializers.IntegerField()
    unlocked = serializers.BooleanField()
    total_poisha = serializers.IntegerField()
    invoice_status = serializers.CharField()


class PatientConsultationDetailSerializer(serializers.ModelSerializer):
    illness = ConsultationIllnessSerializer(read_only=True)
    doctor = ConsultationDoctorSummarySerializer(source="assigned_doctor", read_only=True)
    history = ConsultationHistorySerializer(many=True, read_only=True)
    question_sets = QuestionSetSerializer(many=True, read_only=True)
    prescription_summary = serializers.SerializerMethodField()

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
            "question_sets",
            "prescription_summary",
        ]
        read_only_fields = fields

    @extend_schema_field(PatientPrescriptionBannerSerializer(allow_null=True))
    def get_prescription_summary(self, obj: DoctorConsultation) -> dict[str, Any] | None:
        from apps.billing.models import ConsultationInvoice
        from apps.prescriptions.models import Prescription

        invoice = getattr(obj, "invoice", None)
        if invoice is None:
            return None
        active = (
            Prescription.objects.filter(consultation=obj, status=Prescription.Status.ACTIVE)
            .only("id", "issued_at")
            .first()
        )
        if active is None:
            return None
        return {
            "issued_at": active.issued_at,
            "remedy_count": active.items.count(),
            "unlocked": invoice.status
            in (ConsultationInvoice.Status.PAID, ConsultationInvoice.Status.WAIVED),
            "total_poisha": invoice.total_poisha,
            "invoice_status": invoice.status,
        }


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
        return _area_label(obj.location)


class AdminConsultationSummarySerializer(serializers.ModelSerializer):
    patient_name = serializers.CharField(source="patient.full_name", read_only=True)
    area = serializers.SerializerMethodField()
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

    def get_area(self, obj: DoctorConsultation) -> str:
        return _area_label(obj.patient.location)

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


class AdminAssignDoctorSerializer(serializers.Serializer):
    doctor_id = serializers.UUIDField()
    note = serializers.CharField(max_length=300, required=False, allow_blank=True, default="")


class AssignableDoctorSerializer(serializers.Serializer):
    id = serializers.UUIDField(source="doctor.id", read_only=True)
    doctor_code = serializers.CharField(source="doctor.doctor_code", read_only=True)
    full_name = serializers.CharField(source="doctor.full_name", read_only=True)
    qualifications = serializers.CharField(source="doctor.qualifications", read_only=True)
    area = serializers.SerializerMethodField()
    area_match = serializers.ChoiceField(
        choices=[
            ("UPAZILA", "UPAZILA"),
            ("DISTRICT", "DISTRICT"),
            ("DIVISION", "DIVISION"),
            ("OTHER", "OTHER"),
        ],
        read_only=True,
    )
    consultation_fee_poisha = serializers.IntegerField(
        source="doctor.consultation_fee_poisha", read_only=True
    )
    open_case_count = serializers.IntegerField(read_only=True)

    def get_area(self, obj: Any) -> str:
        return _area_label(obj.doctor.location)


class DoctorPatientProfileSerializer(serializers.Serializer):
    """Read-only patient summary and clinical profile visible to the assigned doctor."""

    id = serializers.UUIDField(read_only=True)
    full_name = serializers.CharField(read_only=True)
    gender = serializers.ChoiceField(choices=Patient.Gender.choices, read_only=True)
    age = serializers.IntegerField(read_only=True)
    location = LocationSerializer(read_only=True)
    picture_url = serializers.SerializerMethodField()
    blood_group = serializers.SerializerMethodField()
    height_cm = serializers.SerializerMethodField()
    weight_kg = serializers.SerializerMethodField()
    marital_status = serializers.SerializerMethodField()
    occupation = serializers.SerializerMethodField()
    family_conditions = serializers.SerializerMethodField()
    family_notes = serializers.SerializerMethodField()
    chronic_conditions = serializers.SerializerMethodField()
    current_medications = serializers.SerializerMethodField()
    allergies = serializers.SerializerMethodField()
    temperament = serializers.SerializerMethodField()
    fears_anxieties = serializers.SerializerMethodField()
    emotional_notes = serializers.SerializerMethodField()
    thermal_preference = serializers.SerializerMethodField()
    appetite_thirst = serializers.SerializerMethodField()
    sleep_dreams = serializers.SerializerMethodField()
    general_notes = serializers.SerializerMethodField()
    food_cravings = serializers.SerializerMethodField()
    food_aversions = serializers.SerializerMethodField()
    weather_modalities = serializers.SerializerMethodField()

    def _profile(self, patient: Patient) -> PatientProfile | None:
        return getattr(patient, "profile", None)

    @extend_schema_field({"type": "string", "format": "uri", "nullable": True})
    def get_picture_url(self, patient: Patient) -> str | None:
        profile = self._profile(patient)
        if not profile or not profile.picture:
            return None
        url = profile.picture.url
        request = self.context.get("request")
        return request.build_absolute_uri(url) if request else url

    def _text(self, patient: Patient, attr: str) -> str:
        profile = self._profile(patient)
        return str(getattr(profile, attr, "")) if profile else ""

    def get_blood_group(self, patient: Patient) -> str:
        return self._text(patient, "blood_group")

    @extend_schema_field({"type": "integer", "nullable": True})
    def get_height_cm(self, patient: Patient) -> int | None:
        profile = self._profile(patient)
        return profile.height_cm if profile else None

    @extend_schema_field({"type": "string", "nullable": True})
    def get_weight_kg(self, patient: Patient) -> str | None:
        profile = self._profile(patient)
        return str(profile.weight_kg) if profile and profile.weight_kg is not None else None

    def get_marital_status(self, patient: Patient) -> str:
        return self._text(patient, "marital_status")

    def get_occupation(self, patient: Patient) -> str:
        return self._text(patient, "occupation")

    def get_family_conditions(self, patient: Patient) -> str:
        return self._text(patient, "family_conditions")

    def get_family_notes(self, patient: Patient) -> str:
        return self._text(patient, "family_notes")

    def get_chronic_conditions(self, patient: Patient) -> str:
        return self._text(patient, "chronic_conditions")

    def get_current_medications(self, patient: Patient) -> str:
        return self._text(patient, "current_medications")

    def get_allergies(self, patient: Patient) -> str:
        return self._text(patient, "allergies")

    def get_temperament(self, patient: Patient) -> str:
        return self._text(patient, "temperament")

    def get_fears_anxieties(self, patient: Patient) -> str:
        return self._text(patient, "fears_anxieties")

    def get_emotional_notes(self, patient: Patient) -> str:
        return self._text(patient, "emotional_notes")

    def get_thermal_preference(self, patient: Patient) -> str:
        return self._text(patient, "thermal_preference")

    def get_appetite_thirst(self, patient: Patient) -> str:
        return self._text(patient, "appetite_thirst")

    def get_sleep_dreams(self, patient: Patient) -> str:
        return self._text(patient, "sleep_dreams")

    def get_general_notes(self, patient: Patient) -> str:
        return self._text(patient, "general_notes")

    def get_food_cravings(self, patient: Patient) -> str:
        return self._text(patient, "food_cravings")

    def get_food_aversions(self, patient: Patient) -> str:
        return self._text(patient, "food_aversions")

    def get_weather_modalities(self, patient: Patient) -> str:
        return self._text(patient, "weather_modalities")


class DoctorConsultationSummarySerializer(serializers.ModelSerializer):
    patient_name = serializers.CharField(source="patient.full_name", read_only=True)
    patient_age = serializers.IntegerField(source="patient.age", read_only=True)
    patient_area = serializers.SerializerMethodField()

    class Meta:
        model = DoctorConsultation
        fields = [
            "id",
            "consultation_code",
            "patient_name",
            "patient_age",
            "patient_area",
            "chief_complaint",
            "urgency",
            "status",
            "submitted_at",
            "assigned_at",
        ]
        read_only_fields = fields

    def get_patient_area(self, obj: DoctorConsultation) -> str:
        return _area_label(obj.patient.location)


class DoctorHistorySummarySerializer(serializers.ModelSerializer):
    class Meta:
        model = DoctorConsultation
        fields = ["id", "consultation_code", "chief_complaint", "status", "submitted_at"]
        read_only_fields = fields


class DoctorConsultationDetailSerializer(serializers.ModelSerializer):
    illness = ConsultationIllnessSerializer(read_only=True)
    patient = DoctorPatientProfileSerializer(read_only=True)
    history = ConsultationHistorySerializer(many=True, read_only=True)
    question_sets = QuestionSetSerializer(many=True, read_only=True)
    patient_history = serializers.SerializerMethodField()

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
            "patient",
            "submitted_at",
            "assigned_at",
            "opened_at",
            "closed_at",
            "history",
            "question_sets",
            "patient_history",
        ]
        read_only_fields = fields

    @extend_schema_field(DoctorHistorySummarySerializer(many=True))
    def get_patient_history(self, obj: DoctorConsultation) -> list[dict[str, Any]]:
        if not obj.assigned_doctor:
            return []
        rows = selectors.patient_history_with_doctor(
            obj.assigned_doctor, obj.patient, exclude_id=obj.pk
        )
        return list(DoctorHistorySummarySerializer(rows, many=True).data)
