from django.contrib.auth.models import User
from django.db.models import Case, IntegerField, Value, When
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import OpenApiParameter, extend_schema, extend_schema_view
from rest_framework import status as http_status
from rest_framework.generics import GenericAPIView, ListAPIView
from rest_framework.parsers import MultiPartParser
from rest_framework.request import Request
from rest_framework.response import Response

from apps.accounts.cookies import set_refresh_cookie
from apps.accounts.serializers import (
    LogInSerializer,
    SessionSerializer,
    VerificationSerializer,
    VerifyCodeSerializer,
)
from apps.accounts.throttles import CodeAddressThrottle, LoginAddressThrottle, LoginPhoneThrottle
from apps.accounts.views import CLIENT_HEADER, IsWebClient, PublicAuthView
from apps.audit import services as audit
from apps.staff.permissions import AdminView
from apps.staff.roles import Perm
from common.serializers import ErrorSerializer

from . import services
from .models import Doctor
from .permissions import IsDoctor
from .serializers import (
    AdminDoctorApproveSerializer,
    AdminDoctorDetailSerializer,
    AdminDoctorFeeUpdateSerializer,
    AdminDoctorReasonSerializer,
    AdminDoctorSummarySerializer,
    CertificateUploadSerializer,
    DoctorApplicationUpdateSerializer,
    DoctorCertificateSerializer,
    DoctorMeSerializer,
    DoctorSignUpSerializer,
)

ADMIN_REFUSED = {401: ErrorSerializer, 403: ErrorSerializer}


class DoctorSignUpView(PublicAuthView):
    throttle_classes = [CodeAddressThrottle]

    @extend_schema(
        operation_id="auth_doctor_signup",
        tags=["auth"],
        request=DoctorSignUpSerializer,
        responses={
            201: VerificationSerializer,
            400: ErrorSerializer,
            409: ErrorSerializer,
            429: ErrorSerializer,
            503: ErrorSerializer,
        },
    )
    def post(self, request: Request) -> Response:
        body = DoctorSignUpSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        challenge = services.sign_up(**body.validated_data)
        return Response(
            VerificationSerializer.describe(challenge),
            status=http_status.HTTP_201_CREATED,
        )


class DoctorVerifyView(PublicAuthView):
    permission_classes = [IsWebClient]
    throttle_classes = [LoginAddressThrottle]

    @extend_schema(
        operation_id="auth_doctor_verify",
        tags=["auth"],
        parameters=[CLIENT_HEADER],
        request=VerifyCodeSerializer,
        responses={200: SessionSerializer, 400: ErrorSerializer, 429: ErrorSerializer},
    )
    def post(self, request: Request) -> Response:
        body = VerifyCodeSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        session = services.verify_sign_up(**body.validated_data)
        response = Response(SessionSerializer.describe(session))
        set_refresh_cookie(response, session)
        return response


class DoctorLogInView(PublicAuthView):
    permission_classes = [IsWebClient]
    throttle_classes = [LoginPhoneThrottle, LoginAddressThrottle]

    @extend_schema(
        operation_id="auth_doctor_login",
        tags=["auth"],
        parameters=[CLIENT_HEADER],
        request=LogInSerializer,
        responses={
            200: SessionSerializer,
            400: ErrorSerializer,
            401: ErrorSerializer,
            403: ErrorSerializer,
            429: ErrorSerializer,
        },
    )
    def post(self, request: Request) -> Response:
        body = LogInSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        session = services.log_in(**body.validated_data)
        response = Response(SessionSerializer.describe(session))
        set_refresh_cookie(response, session)
        return response


class DoctorMeView(GenericAPIView):
    permission_classes = [IsDoctor]
    serializer_class = DoctorMeSerializer
    filter_backends: list = []

    @extend_schema(
        operation_id="doctor_me",
        tags=["doctor"],
        responses={200: DoctorMeSerializer, 401: ErrorSerializer},
    )
    def get(self, request: Request) -> Response:
        assert isinstance(request.user, Doctor)
        doctor = (
            Doctor.objects.select_related("location")
            .prefetch_related("certificates")
            .get(pk=request.user.pk)
        )
        return Response(self.get_serializer(doctor).data)


class DoctorApplicationView(GenericAPIView):
    permission_classes = [IsDoctor]
    serializer_class = DoctorApplicationUpdateSerializer
    filter_backends: list = []

    @extend_schema(
        operation_id="doctor_application_update",
        tags=["doctor"],
        request=DoctorApplicationUpdateSerializer,
        responses={200: DoctorMeSerializer, 400: ErrorSerializer, 409: ErrorSerializer},
    )
    def patch(self, request: Request) -> Response:
        assert isinstance(request.user, Doctor)
        body = self.get_serializer(data=request.data, partial=True)
        body.is_valid(raise_exception=True)
        updated = services.update_application(request.user, **body.validated_data)
        return Response(DoctorMeSerializer(updated, context=self.get_serializer_context()).data)


class DoctorCertificateUploadView(GenericAPIView):
    permission_classes = [IsDoctor]
    serializer_class = DoctorCertificateSerializer
    parser_classes = [MultiPartParser]
    filter_backends: list = []

    @extend_schema(
        operation_id="doctor_certificate_upload",
        tags=["doctor"],
        request={"multipart/form-data": CertificateUploadSerializer},
        responses={
            201: DoctorCertificateSerializer,
            400: ErrorSerializer,
            409: ErrorSerializer,
            503: ErrorSerializer,
        },
    )
    def post(self, request: Request) -> Response:
        assert isinstance(request.user, Doctor)
        body = CertificateUploadSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        cert = services.add_certificate(request.user, body.validated_data["file"])
        return Response(self.get_serializer(cert).data, status=http_status.HTTP_201_CREATED)


class DoctorCertificateDeleteView(GenericAPIView):
    permission_classes = [IsDoctor]
    filter_backends: list = []

    @extend_schema(
        operation_id="doctor_certificate_delete",
        tags=["doctor"],
        request=None,
        responses={204: None, 409: ErrorSerializer},
    )
    def delete(self, request: Request, pk) -> Response:
        assert isinstance(request.user, Doctor)
        services.remove_certificate(request.user, pk)
        return Response(status=http_status.HTTP_204_NO_CONTENT)


class DoctorResubmitView(GenericAPIView):
    permission_classes = [IsDoctor]
    serializer_class = DoctorMeSerializer
    filter_backends: list = []

    @extend_schema(
        operation_id="doctor_application_resubmit",
        tags=["doctor"],
        request=None,
        responses={200: DoctorMeSerializer, 409: ErrorSerializer},
    )
    def post(self, request: Request) -> Response:
        assert isinstance(request.user, Doctor)
        updated = services.resubmit(request.user)
        return Response(self.get_serializer(updated).data)


# --- Admin endpoints ---------------------------------------------------------------


def _admin_doctors_queryset():
    return Doctor.objects.select_related(
        "location", "approved_by", "rejected_by", "suspended_by"
    ).prefetch_related("certificates")


@extend_schema_view(
    get=extend_schema(
        operation_id="admin_doctors_list",
        tags=["admin"],
        parameters=[OpenApiParameter("status", str, enum=list(Doctor.Status.values))],
    )
)
class AdminDoctorListView(AdminView, ListAPIView):
    required_permissions = {"GET": Perm.VIEW_DOCTORS}
    serializer_class = AdminDoctorSummarySerializer
    search_fields = ["full_name", "phone", "registration_no", "doctor_code"]
    filterset_fields = ["status"]
    ordering_fields = ["submitted_at", "created_at", "full_name"]
    ordering = ["_status_priority", "submitted_at", "created_at"]

    def get_queryset(self):
        return (
            Doctor.objects.select_related("location")
            .annotate(
                _status_priority=Case(
                    When(status=Doctor.Status.PENDING_APPROVAL, then=Value(0)),
                    default=Value(1),
                    output_field=IntegerField(),
                )
            )
            .filter(phone_verified_at__isnull=False)
        )


class AdminDoctorDetailView(AdminView, GenericAPIView):
    required_permissions = {"GET": Perm.VIEW_DOCTORS, "PATCH": Perm.MANAGE_DOCTORS}
    serializer_class = AdminDoctorDetailSerializer
    filter_backends: list = []

    def get_queryset(self):
        return _admin_doctors_queryset()

    @extend_schema(
        operation_id="admin_doctors_read",
        tags=["admin"],
        responses={200: AdminDoctorDetailSerializer, 404: ErrorSerializer, **ADMIN_REFUSED},
    )
    def get(self, request: Request, pk) -> Response:
        return Response(self.get_serializer(self.get_object()).data)

    @extend_schema(
        operation_id="admin_doctors_update_fee",
        tags=["admin"],
        request=AdminDoctorFeeUpdateSerializer,
        responses={
            200: AdminDoctorDetailSerializer,
            400: ErrorSerializer,
            409: ErrorSerializer,
            **ADMIN_REFUSED,
        },
    )
    def patch(self, request: Request, pk) -> Response:
        doctor = self.get_object()
        before = audit.snapshot(doctor, ["status", "consultation_fee_poisha"])
        body = AdminDoctorFeeUpdateSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        updated = services.set_fee(doctor, body.validated_data["consultation_fee_poisha"])
        audit.change(
            request,
            "doctor.fee.update",
            updated,
            before=before,
            after=audit.snapshot(updated, ["status", "consultation_fee_poisha"]),
        )
        refreshed = _admin_doctors_queryset().get(pk=updated.pk)
        return Response(self.get_serializer(refreshed).data)


class AdminDoctorApproveView(AdminView, GenericAPIView):
    required_permissions = {"POST": Perm.MANAGE_DOCTORS}
    serializer_class = AdminDoctorDetailSerializer
    filter_backends: list = []

    @extend_schema(
        operation_id="admin_doctors_approve",
        tags=["admin"],
        request=AdminDoctorApproveSerializer,
        responses={
            200: AdminDoctorDetailSerializer,
            400: ErrorSerializer,
            409: ErrorSerializer,
            **ADMIN_REFUSED,
        },
    )
    def post(self, request: Request, pk) -> Response:
        doctor = get_object_or_404(Doctor, pk=pk)
        before = audit.snapshot(doctor, ["status", "consultation_fee_poisha", "doctor_code"])
        body = AdminDoctorApproveSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        assert isinstance(request.user, User)
        updated = services.approve(
            doctor, request.user, body.validated_data["consultation_fee_poisha"]
        )
        audit.change(
            request,
            "doctor.approve",
            updated,
            before=before,
            after=audit.snapshot(updated, ["status", "consultation_fee_poisha", "doctor_code"]),
        )
        refreshed = _admin_doctors_queryset().get(pk=updated.pk)
        return Response(self.get_serializer(refreshed).data)


class AdminDoctorRejectView(AdminView, GenericAPIView):
    required_permissions = {"POST": Perm.MANAGE_DOCTORS}
    serializer_class = AdminDoctorDetailSerializer
    filter_backends: list = []

    @extend_schema(
        operation_id="admin_doctors_reject",
        tags=["admin"],
        request=AdminDoctorReasonSerializer,
        responses={
            200: AdminDoctorDetailSerializer,
            400: ErrorSerializer,
            409: ErrorSerializer,
            **ADMIN_REFUSED,
        },
    )
    def post(self, request: Request, pk) -> Response:
        doctor = get_object_or_404(Doctor, pk=pk)
        before = audit.snapshot(doctor, ["status", "rejection_reason"])
        body = AdminDoctorReasonSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        assert isinstance(request.user, User)
        updated = services.reject(doctor, request.user, body.validated_data["reason"])
        audit.change(
            request,
            "doctor.reject",
            updated,
            before=before,
            after=audit.snapshot(updated, ["status", "rejection_reason"]),
        )
        refreshed = _admin_doctors_queryset().get(pk=updated.pk)
        return Response(self.get_serializer(refreshed).data)


class AdminDoctorSuspendView(AdminView, GenericAPIView):
    required_permissions = {"POST": Perm.MANAGE_DOCTORS}
    serializer_class = AdminDoctorDetailSerializer
    filter_backends: list = []

    @extend_schema(
        operation_id="admin_doctors_suspend",
        tags=["admin"],
        request=AdminDoctorReasonSerializer,
        responses={
            200: AdminDoctorDetailSerializer,
            400: ErrorSerializer,
            409: ErrorSerializer,
            **ADMIN_REFUSED,
        },
    )
    def post(self, request: Request, pk) -> Response:
        doctor = get_object_or_404(Doctor, pk=pk)
        before = audit.snapshot(doctor, ["status", "suspension_reason"])
        body = AdminDoctorReasonSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        assert isinstance(request.user, User)
        updated = services.suspend(doctor, request.user, body.validated_data["reason"])
        audit.change(
            request,
            "doctor.suspend",
            updated,
            before=before,
            after=audit.snapshot(updated, ["status", "suspension_reason"]),
        )
        refreshed = _admin_doctors_queryset().get(pk=updated.pk)
        return Response(self.get_serializer(refreshed).data)


class AdminDoctorReactivateView(AdminView, GenericAPIView):
    required_permissions = {"POST": Perm.MANAGE_DOCTORS}
    serializer_class = AdminDoctorDetailSerializer
    filter_backends: list = []

    @extend_schema(
        operation_id="admin_doctors_reactivate",
        tags=["admin"],
        request=None,
        responses={
            200: AdminDoctorDetailSerializer,
            409: ErrorSerializer,
            **ADMIN_REFUSED,
        },
    )
    def post(self, request: Request, pk) -> Response:
        doctor = get_object_or_404(Doctor, pk=pk)
        before = audit.snapshot(doctor, ["status"])
        assert isinstance(request.user, User)
        updated = services.reactivate(doctor, request.user)
        audit.change(
            request,
            "doctor.reactivate",
            updated,
            before=before,
            after=audit.snapshot(updated, ["status"]),
        )
        refreshed = _admin_doctors_queryset().get(pk=updated.pk)
        return Response(self.get_serializer(refreshed).data)
