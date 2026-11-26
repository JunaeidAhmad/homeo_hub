"""Serializers for video appointment scheduling, events, and live calls."""

from typing import Any

from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from .models import AppointmentEvent, CallSession, VideoAppointment


class AppointmentEventSerializer(serializers.ModelSerializer):
    preferred_times = serializers.ListField(child=serializers.DateTimeField(), read_only=True)

    class Meta:
        model = AppointmentEvent
        fields = [
            "id",
            "kind",
            "actor_type",
            "note",
            "proposed_start_at",
            "preferred_times",
            "created_at",
        ]
        read_only_fields = fields


class DoctorCallSessionSerializer(serializers.ModelSerializer):
    class Meta:
        model = CallSession
        fields = [
            "id",
            "status",
            "started_at",
            "patient_joined_at",
            "ended_at",
            "duration_seconds",
        ]
        read_only_fields = fields


class DoctorAppointmentSerializer(serializers.ModelSerializer):
    consultation_id = serializers.UUIDField(read_only=True)
    events = AppointmentEventSerializer(many=True, read_only=True)
    active_call = serializers.SerializerMethodField()
    has_patient_joined = serializers.SerializerMethodField()

    class Meta:
        model = VideoAppointment
        fields = [
            "id",
            "consultation_id",
            "start_at",
            "duration_minutes",
            "end_at",
            "status",
            "meeting_link",
            "meeting_host",
            "active_call",
            "has_patient_joined",
            "events",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields

    @extend_schema_field(DoctorCallSessionSerializer(allow_null=True))
    def get_active_call(self, obj: VideoAppointment) -> dict[str, Any] | None:
        for call in obj.calls.all():
            if call.status in (CallSession.Status.RINGING, CallSession.Status.LIVE):
                return dict(DoctorCallSessionSerializer(call).data)
        return None

    def get_has_patient_joined(self, obj: VideoAppointment) -> bool:
        return any(call.patient_joined_at is not None for call in obj.calls.all())


class PatientAppointmentSerializer(serializers.ModelSerializer):
    consultation_id = serializers.UUIDField(read_only=True)
    consultation_code = serializers.CharField(
        source="consultation.consultation_code", read_only=True
    )
    doctor_name = serializers.CharField(source="doctor.full_name", read_only=True)
    events = AppointmentEventSerializer(many=True, read_only=True)

    class Meta:
        model = VideoAppointment
        fields = [
            "id",
            "consultation_id",
            "consultation_code",
            "doctor_name",
            "start_at",
            "duration_minutes",
            "end_at",
            "status",
            "meeting_host",
            "events",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


class DoctorCalendarItemSerializer(serializers.ModelSerializer):
    consultation_id = serializers.UUIDField(read_only=True)
    consultation_code = serializers.CharField(
        source="consultation.consultation_code", read_only=True
    )
    patient_name = serializers.CharField(source="consultation.patient.full_name", read_only=True)

    class Meta:
        model = VideoAppointment
        fields = [
            "id",
            "consultation_id",
            "consultation_code",
            "patient_name",
            "start_at",
            "duration_minutes",
            "end_at",
            "status",
        ]
        read_only_fields = fields


class ProposeAppointmentSerializer(serializers.Serializer):
    start_at = serializers.DateTimeField()
    duration_minutes = serializers.IntegerField(min_value=10, max_value=60, default=20)
    note = serializers.CharField(max_length=500, required=False, allow_blank=True, default="")


class AppointmentNoteSerializer(serializers.Serializer):
    note = serializers.CharField(max_length=500, required=False, allow_blank=True, default="")


class RescheduleRequestSerializer(serializers.Serializer):
    note = serializers.CharField(max_length=500, required=False, allow_blank=True, default="")
    preferred_times = serializers.ListField(
        child=serializers.DateTimeField(),
        max_length=3,
        required=False,
        default=list,
    )

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        return attrs


class DoctorMeetingLinkSerializer(serializers.Serializer):
    meeting_link = serializers.CharField(max_length=500)


class DoctorCallStartResponseSerializer(serializers.Serializer):
    call_id = serializers.UUIDField()
    join_url = serializers.URLField()


class PatientCallStatusSerializer(serializers.Serializer):
    call_id = serializers.UUIDField()
    status = serializers.ChoiceField(choices=CallSession.Status.choices)
    doctor_name = serializers.CharField()
    meeting_host = serializers.CharField()
    patient_joined_at = serializers.DateTimeField(allow_null=True)


class PatientCallJoinResponseSerializer(serializers.Serializer):
    call_id = serializers.UUIDField()
    status = serializers.ChoiceField(choices=CallSession.Status.choices)
    join_url = serializers.URLField()
