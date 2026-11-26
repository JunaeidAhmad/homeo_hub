"""Doctor and patient appointment scheduling API endpoints."""

from datetime import datetime, time, timedelta
from typing import cast
from zoneinfo import ZoneInfo

from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.dateparse import parse_date, parse_datetime
from drf_spectacular.utils import OpenApiParameter, OpenApiResponse, extend_schema
from rest_framework import status as http_status
from rest_framework.exceptions import ErrorDetail, ValidationError
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.consultations.models import DoctorConsultation
from apps.doctors.models import Doctor
from apps.doctors.permissions import IsApprovedDoctor
from apps.patients.models import Patient
from apps.patients.permissions import IsPatient
from common.serializers import ErrorSerializer

from . import services
from .models import CallSession, VideoAppointment
from .serializers import (
    AppointmentNoteSerializer,
    DoctorAppointmentSerializer,
    DoctorCalendarItemSerializer,
    DoctorCallStartResponseSerializer,
    DoctorMeetingLinkSerializer,
    PatientAppointmentSerializer,
    PatientCallJoinResponseSerializer,
    PatientCallStatusSerializer,
    ProposeAppointmentSerializer,
    RescheduleRequestSerializer,
)

DHAKA_TZ = ZoneInfo("Asia/Dhaka")
_DOCTOR_CALENDAR_STATUSES = (
    VideoAppointment.Status.PROPOSED,
    VideoAppointment.Status.RESCHEDULE_REQUESTED,
    VideoAppointment.Status.ACCEPTED,
    VideoAppointment.Status.IN_PROGRESS,
    VideoAppointment.Status.COMPLETED,
    VideoAppointment.Status.NO_SHOW,
)


def _parse_bound(raw: str, *, end: bool) -> datetime:
    cleaned = raw.strip()
    dt = parse_datetime(cleaned)
    if dt is not None:
        return timezone.make_aware(dt, DHAKA_TZ) if timezone.is_naive(dt) else dt
    d = parse_date(cleaned)
    if d is not None:
        t = time(23, 59, 59) if end else time(0, 0, 0)
        return datetime.combine(d, t, tzinfo=DHAKA_TZ)
    raise ValidationError({"from": [ErrorDetail("Use an ISO date or timestamp.", code="invalid")]})


def _load_doctor_appointment(pk: str) -> VideoAppointment:
    return get_object_or_404(
        VideoAppointment.objects.select_related("consultation", "doctor").prefetch_related(
            "events", "calls"
        ),
        pk=pk,
    )


def _load_patient_appointment(pk: str) -> VideoAppointment:
    return get_object_or_404(
        VideoAppointment.objects.select_related("consultation", "doctor").prefetch_related(
            "events"
        ),
        pk=pk,
    )


class DoctorConsultationAppointmentsView(APIView):
    permission_classes = [IsApprovedDoctor]

    @extend_schema(
        operation_id="doctor_consultation_appointments_list",
        tags=["doctor"],
        responses={
            200: DoctorAppointmentSerializer(many=True),
            401: ErrorSerializer,
            403: ErrorSerializer,
            404: ErrorSerializer,
        },
    )
    def get(self, request: Request, pk: str) -> Response:
        doctor = cast(Doctor, request.user)
        case = get_object_or_404(DoctorConsultation, pk=pk, assigned_doctor=doctor)
        services.expire_passed_for(consultation=case)
        appts = (
            VideoAppointment.objects.filter(consultation=case)
            .prefetch_related("events", "calls")
            .order_by("-created_at", "-id")
        )
        return Response(DoctorAppointmentSerializer(appts, many=True).data)

    @extend_schema(
        operation_id="doctor_consultation_appointments_propose",
        tags=["doctor"],
        request=ProposeAppointmentSerializer,
        responses={
            201: DoctorAppointmentSerializer,
            400: ErrorSerializer,
            401: ErrorSerializer,
            403: ErrorSerializer,
            404: ErrorSerializer,
            409: ErrorSerializer,
        },
    )
    def post(self, request: Request, pk: str) -> Response:
        doctor = cast(Doctor, request.user)
        case = get_object_or_404(DoctorConsultation, pk=pk, assigned_doctor=doctor)
        body = ProposeAppointmentSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        appt = services.propose(case, doctor, **body.validated_data)
        loaded = _load_doctor_appointment(str(appt.pk))
        return Response(
            DoctorAppointmentSerializer(loaded).data,
            status=http_status.HTTP_201_CREATED,
        )


class DoctorAppointmentReproposeView(APIView):
    permission_classes = [IsApprovedDoctor]

    @extend_schema(
        operation_id="doctor_appointments_repropose",
        tags=["doctor"],
        request=ProposeAppointmentSerializer,
        responses={
            200: DoctorAppointmentSerializer,
            400: ErrorSerializer,
            401: ErrorSerializer,
            403: ErrorSerializer,
            404: ErrorSerializer,
            409: ErrorSerializer,
        },
    )
    def post(self, request: Request, pk: str) -> Response:
        doctor = cast(Doctor, request.user)
        appt = get_object_or_404(
            VideoAppointment, pk=pk, doctor=doctor, consultation__assigned_doctor=doctor
        )
        body = ProposeAppointmentSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        updated = services.repropose(appt, doctor, **body.validated_data)
        loaded = _load_doctor_appointment(str(updated.pk))
        return Response(DoctorAppointmentSerializer(loaded).data)


class DoctorAppointmentCancelView(APIView):
    permission_classes = [IsApprovedDoctor]

    @extend_schema(
        operation_id="doctor_appointments_cancel",
        tags=["doctor"],
        request=AppointmentNoteSerializer,
        responses={
            200: DoctorAppointmentSerializer,
            400: ErrorSerializer,
            401: ErrorSerializer,
            403: ErrorSerializer,
            404: ErrorSerializer,
            409: ErrorSerializer,
        },
    )
    def post(self, request: Request, pk: str) -> Response:
        doctor = cast(Doctor, request.user)
        appt = get_object_or_404(
            VideoAppointment, pk=pk, doctor=doctor, consultation__assigned_doctor=doctor
        )
        body = AppointmentNoteSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        updated = services.cancel(
            appt, actor_type="doctor", note=body.validated_data.get("note", "")
        )
        loaded = _load_doctor_appointment(str(updated.pk))
        return Response(DoctorAppointmentSerializer(loaded).data)


class DoctorCalendarView(APIView):
    permission_classes = [IsApprovedDoctor]

    @extend_schema(
        operation_id="doctor_appointments_calendar",
        tags=["doctor"],
        parameters=[
            OpenApiParameter(name="from", type=str, required=False),
            OpenApiParameter(name="to", type=str, required=False),
        ],
        responses={
            200: DoctorCalendarItemSerializer(many=True),
            400: ErrorSerializer,
            401: ErrorSerializer,
            403: ErrorSerializer,
        },
    )
    def get(self, request: Request) -> Response:
        doctor = cast(Doctor, request.user)
        services.expire_passed_for(doctor=doctor)
        raw_from = request.query_params.get("from", "").strip()
        raw_to = request.query_params.get("to", "").strip()
        now_local = timezone.now().astimezone(DHAKA_TZ)
        start = (
            _parse_bound(raw_from, end=False)
            if raw_from
            else datetime.combine(now_local.date(), time(0, 0, 0), tzinfo=DHAKA_TZ)
        )
        end = _parse_bound(raw_to, end=True) if raw_to else start + timedelta(days=14)
        if end < start or (end - start) > timedelta(days=31, seconds=86399):
            raise ValidationError(
                {"to": [ErrorDetail("Range must be between 0 and 31 days.", code="invalid")]}
            )
        appts = (
            VideoAppointment.objects.filter(
                doctor=doctor,
                status__in=_DOCTOR_CALENDAR_STATUSES,
                start_at__gte=start,
                start_at__lte=end,
            )
            .select_related("consultation", "consultation__patient")
            .order_by("start_at", "id")
        )
        return Response(DoctorCalendarItemSerializer(appts, many=True).data)


class PatientConsultationAppointmentsView(APIView):
    permission_classes = [IsPatient]

    @extend_schema(
        operation_id="consultations_appointments_list",
        tags=["consultations"],
        responses={
            200: PatientAppointmentSerializer(many=True),
            401: ErrorSerializer,
            404: ErrorSerializer,
        },
    )
    def get(self, request: Request, pk: str) -> Response:
        patient = cast(Patient, request.user)
        case = get_object_or_404(DoctorConsultation, pk=pk, patient=patient)
        services.expire_passed_for(consultation=case)
        appts = (
            VideoAppointment.objects.filter(consultation=case)
            .select_related("consultation", "doctor")
            .prefetch_related("events")
            .order_by("-created_at", "-id")
        )
        return Response(PatientAppointmentSerializer(appts, many=True).data)


class PatientAppointmentAcceptView(APIView):
    permission_classes = [IsPatient]

    @extend_schema(
        operation_id="appointments_accept",
        tags=["telemedicine"],
        request=None,
        responses={
            200: PatientAppointmentSerializer,
            401: ErrorSerializer,
            404: ErrorSerializer,
            409: ErrorSerializer,
        },
    )
    def post(self, request: Request, pk: str) -> Response:
        patient = cast(Patient, request.user)
        appt = get_object_or_404(VideoAppointment, pk=pk, consultation__patient=patient)
        updated = services.accept(appt, patient)
        loaded = _load_patient_appointment(str(updated.pk))
        return Response(PatientAppointmentSerializer(loaded).data)


class PatientAppointmentRejectView(APIView):
    permission_classes = [IsPatient]

    @extend_schema(
        operation_id="appointments_reject",
        tags=["telemedicine"],
        request=AppointmentNoteSerializer,
        responses={
            200: PatientAppointmentSerializer,
            400: ErrorSerializer,
            401: ErrorSerializer,
            404: ErrorSerializer,
            409: ErrorSerializer,
        },
    )
    def post(self, request: Request, pk: str) -> Response:
        patient = cast(Patient, request.user)
        appt = get_object_or_404(VideoAppointment, pk=pk, consultation__patient=patient)
        body = AppointmentNoteSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        updated = services.reject(appt, patient, note=body.validated_data.get("note", ""))
        loaded = _load_patient_appointment(str(updated.pk))
        return Response(PatientAppointmentSerializer(loaded).data)


class PatientAppointmentRescheduleView(APIView):
    permission_classes = [IsPatient]

    @extend_schema(
        operation_id="appointments_reschedule_request",
        tags=["telemedicine"],
        request=RescheduleRequestSerializer,
        responses={
            200: PatientAppointmentSerializer,
            400: ErrorSerializer,
            401: ErrorSerializer,
            404: ErrorSerializer,
            409: ErrorSerializer,
        },
    )
    def post(self, request: Request, pk: str) -> Response:
        patient = cast(Patient, request.user)
        appt = get_object_or_404(VideoAppointment, pk=pk, consultation__patient=patient)
        body = RescheduleRequestSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        updated = services.request_reschedule(
            appt,
            patient,
            note=body.validated_data.get("note", ""),
            preferred_times=body.validated_data.get("preferred_times", []),
        )
        loaded = _load_patient_appointment(str(updated.pk))
        return Response(PatientAppointmentSerializer(loaded).data)


class PatientAppointmentCancelView(APIView):
    permission_classes = [IsPatient]

    @extend_schema(
        operation_id="appointments_cancel",
        tags=["telemedicine"],
        request=AppointmentNoteSerializer,
        responses={
            200: PatientAppointmentSerializer,
            400: ErrorSerializer,
            401: ErrorSerializer,
            404: ErrorSerializer,
            409: ErrorSerializer,
        },
    )
    def post(self, request: Request, pk: str) -> Response:
        patient = cast(Patient, request.user)
        appt = get_object_or_404(VideoAppointment, pk=pk, consultation__patient=patient)
        body = AppointmentNoteSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        updated = services.cancel(
            appt, actor_type="patient", note=body.validated_data.get("note", "")
        )
        loaded = _load_patient_appointment(str(updated.pk))
        return Response(PatientAppointmentSerializer(loaded).data)


class PatientUpcomingAppointmentView(APIView):
    permission_classes = [IsPatient]

    @extend_schema(
        operation_id="appointments_upcoming",
        tags=["telemedicine"],
        responses={
            200: PatientAppointmentSerializer,
            204: OpenApiResponse(description="No upcoming confirmed appointment"),
            401: ErrorSerializer,
        },
    )
    def get(self, request: Request) -> Response:
        patient = cast(Patient, request.user)
        services.expire_passed_for(consultation__patient=patient)
        now = timezone.now()
        appt = (
            VideoAppointment.objects.filter(
                consultation__patient=patient,
                status__in=(
                    VideoAppointment.Status.ACCEPTED,
                    VideoAppointment.Status.IN_PROGRESS,
                ),
                end_at__gt=now,
            )
            .select_related("consultation", "doctor")
            .prefetch_related("events")
            .order_by("start_at", "id")
            .first()
        )
        if appt is None:
            return Response(status=http_status.HTTP_204_NO_CONTENT)
        return Response(PatientAppointmentSerializer(appt).data)


class DoctorAppointmentDetailView(APIView):
    permission_classes = [IsApprovedDoctor]

    @extend_schema(
        operation_id="doctor_appointments_update",
        tags=["doctor"],
        request=DoctorMeetingLinkSerializer,
        responses={
            200: DoctorAppointmentSerializer,
            400: ErrorSerializer,
            401: ErrorSerializer,
            403: ErrorSerializer,
            404: ErrorSerializer,
            409: ErrorSerializer,
        },
    )
    def patch(self, request: Request, pk: str) -> Response:
        doctor = cast(Doctor, request.user)
        appt = get_object_or_404(
            VideoAppointment, pk=pk, doctor=doctor, consultation__assigned_doctor=doctor
        )
        body = DoctorMeetingLinkSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        updated = services.save_meeting_link(
            appt, doctor, meeting_link=body.validated_data["meeting_link"]
        )
        loaded = _load_doctor_appointment(str(updated.pk))
        return Response(DoctorAppointmentSerializer(loaded).data)


class DoctorAppointmentStartCallView(APIView):
    permission_classes = [IsApprovedDoctor]

    @extend_schema(
        operation_id="doctor_appointments_start_call",
        tags=["doctor"],
        request=None,
        responses={
            200: DoctorCallStartResponseSerializer,
            401: ErrorSerializer,
            403: ErrorSerializer,
            404: ErrorSerializer,
            409: ErrorSerializer,
        },
    )
    def post(self, request: Request, pk: str) -> Response:
        doctor = cast(Doctor, request.user)
        appt = get_object_or_404(
            VideoAppointment, pk=pk, doctor=doctor, consultation__assigned_doctor=doctor
        )
        call, join_url = services.start_call(appt, doctor)
        return Response({"call_id": call.pk, "join_url": join_url})


class DoctorCallEndView(APIView):
    permission_classes = [IsApprovedDoctor]

    @extend_schema(
        operation_id="doctor_calls_end",
        tags=["doctor"],
        request=None,
        responses={
            200: DoctorAppointmentSerializer,
            401: ErrorSerializer,
            403: ErrorSerializer,
            404: ErrorSerializer,
            409: ErrorSerializer,
        },
    )
    def post(self, request: Request, pk: str) -> Response:
        doctor = cast(Doctor, request.user)
        call = get_object_or_404(
            CallSession,
            pk=pk,
            appointment__doctor=doctor,
            appointment__consultation__assigned_doctor=doctor,
        )
        ended = services.end_call(call, doctor)
        loaded = _load_doctor_appointment(str(ended.appointment_id))
        return Response(DoctorAppointmentSerializer(loaded).data)


class DoctorAppointmentNoShowView(APIView):
    permission_classes = [IsApprovedDoctor]

    @extend_schema(
        operation_id="doctor_appointments_no_show",
        tags=["doctor"],
        request=None,
        responses={
            200: DoctorAppointmentSerializer,
            401: ErrorSerializer,
            403: ErrorSerializer,
            404: ErrorSerializer,
            409: ErrorSerializer,
        },
    )
    def post(self, request: Request, pk: str) -> Response:
        doctor = cast(Doctor, request.user)
        appt = get_object_or_404(
            VideoAppointment, pk=pk, doctor=doctor, consultation__assigned_doctor=doctor
        )
        updated = services.mark_no_show(appt, doctor)
        loaded = _load_doctor_appointment(str(updated.pk))
        return Response(DoctorAppointmentSerializer(loaded).data)


class PatientAppointmentCallView(APIView):
    permission_classes = [IsPatient]

    @extend_schema(
        operation_id="appointments_call_status",
        tags=["telemedicine"],
        responses={
            200: PatientCallStatusSerializer,
            204: OpenApiResponse(description="No ringing or live call"),
            401: ErrorSerializer,
            404: ErrorSerializer,
        },
    )
    def get(self, request: Request, pk: str) -> Response:
        patient = cast(Patient, request.user)
        appt = get_object_or_404(
            VideoAppointment.objects.select_related("doctor"),
            pk=pk,
            consultation__patient=patient,
        )
        call = (
            appt.calls.filter(status__in=(CallSession.Status.RINGING, CallSession.Status.LIVE))
            .order_by("-started_at", "-id")
            .first()
        )
        if call is None:
            return Response(status=http_status.HTTP_204_NO_CONTENT)
        return Response(
            {
                "call_id": call.pk,
                "status": call.status,
                "doctor_name": appt.doctor.full_name,
                "meeting_host": appt.meeting_host,
                "patient_joined_at": call.patient_joined_at,
            }
        )


class PatientCallJoinView(APIView):
    permission_classes = [IsPatient]

    @extend_schema(
        operation_id="calls_join",
        tags=["telemedicine"],
        request=None,
        responses={
            200: PatientCallJoinResponseSerializer,
            401: ErrorSerializer,
            404: ErrorSerializer,
            409: ErrorSerializer,
        },
    )
    def post(self, request: Request, pk: str) -> Response:
        patient = cast(Patient, request.user)
        call = get_object_or_404(CallSession, pk=pk, appointment__consultation__patient=patient)
        joined, join_url = services.join_call(call, patient)
        return Response(
            {
                "call_id": joined.pk,
                "status": joined.status,
                "join_url": join_url,
            }
        )
