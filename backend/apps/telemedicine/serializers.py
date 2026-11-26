"""Serializers for video appointment scheduling and events."""

from typing import Any

from rest_framework import serializers

from .models import AppointmentEvent, VideoAppointment


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


class DoctorAppointmentSerializer(serializers.ModelSerializer):
    consultation_id = serializers.UUIDField(read_only=True)
    events = AppointmentEventSerializer(many=True, read_only=True)

    class Meta:
        model = VideoAppointment
        fields = [
            "id",
            "consultation_id",
            "start_at",
            "duration_minutes",
            "end_at",
            "status",
            "events",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


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
