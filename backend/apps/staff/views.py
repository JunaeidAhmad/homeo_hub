from django.conf import settings
from django.contrib.auth.models import User
from drf_spectacular.utils import PolymorphicProxySerializer, extend_schema, extend_schema_view
from rest_framework import status
from rest_framework.generics import GenericAPIView, ListAPIView, get_object_or_404
from rest_framework.request import Request
from rest_framework.response import Response

from apps.accounts.cookies import set_refresh_cookie
from apps.accounts.serializers import SessionSerializer
from apps.accounts.throttles import LoginAddressThrottle, LoginUsernameThrottle
from apps.accounts.views import CLIENT_HEADER, IsWebClient, PublicAuthView
from apps.audit import services as audit
from common.serializers import ErrorSerializer

from . import services
from .permissions import ANY_STAFF, AdminView
from .roles import ROLE_PERMISSIONS, Perm
from .serializers import (
    AdminMeSerializer,
    RoleSerializer,
    StaffCreateSerializer,
    StaffLogInSerializer,
    StaffSerializer,
    StaffTotpChallengeSerializer,
    StaffTotpSessionSerializer,
    StaffTotpSetupRequestSerializer,
    StaffTotpSetupResponseSerializer,
    StaffTotpVerifyRequestSerializer,
    StaffUpdateSerializer,
)

REFUSED = {401: ErrorSerializer, 403: ErrorSerializer}
STAFF_AUDIT_FIELDS = ["username", "first_name", "is_active"]


class StaffLogInView(PublicAuthView):
    permission_classes = [IsWebClient]  # it sets the session cookie
    throttle_classes = [LoginUsernameThrottle, LoginAddressThrottle]

    @extend_schema(
        operation_id="auth_staff_login",
        tags=["auth"],
        parameters=[CLIENT_HEADER],
        request=StaffLogInSerializer,
        responses={
            200: PolymorphicProxySerializer(
                component_name="StaffLogInResponse",
                serializers=[SessionSerializer, StaffTotpChallengeSerializer],
                resource_type_field_name=None,
            ),
            400: ErrorSerializer,
            401: ErrorSerializer,
            429: ErrorSerializer,
        },
    )
    def post(self, request: Request) -> Response:
        body = StaffLogInSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        user = services.check_credentials(**body.validated_data)
        if not getattr(settings, "STAFF_TOTP_REQUIRED", True):
            session = services.open_staff_session(user)
            response = Response(SessionSerializer.describe(session))
            set_refresh_cookie(response, session)
            return response

        challenge_id, setup_required = services.issue_totp_challenge(user)
        return Response(
            StaffTotpChallengeSerializer(
                {
                    "totp_required": True,
                    "setup_required": setup_required,
                    "challenge_id": challenge_id,
                }
            ).data
        )


class StaffTotpSetupView(PublicAuthView):
    permission_classes = [IsWebClient]
    throttle_classes = [LoginAddressThrottle]

    @extend_schema(
        operation_id="auth_staff_totp_setup",
        tags=["auth"],
        parameters=[CLIENT_HEADER],
        request=StaffTotpSetupRequestSerializer,
        responses={
            200: StaffTotpSetupResponseSerializer,
            400: ErrorSerializer,
            401: ErrorSerializer,
            409: ErrorSerializer,
            429: ErrorSerializer,
        },
    )
    def post(self, request: Request) -> Response:
        body = StaffTotpSetupRequestSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        secret, otpauth_uri, qr_svg = services.begin_totp_setup(body.validated_data["challenge_id"])
        return Response(
            StaffTotpSetupResponseSerializer(
                {"secret": secret, "otpauth_uri": otpauth_uri, "qr_svg": qr_svg}
            ).data
        )


class StaffTotpVerifyView(PublicAuthView):
    permission_classes = [IsWebClient]
    throttle_classes = [LoginAddressThrottle]

    @extend_schema(
        operation_id="auth_staff_totp_verify",
        tags=["auth"],
        parameters=[CLIENT_HEADER],
        request=StaffTotpVerifyRequestSerializer,
        responses={
            200: StaffTotpSessionSerializer,
            400: ErrorSerializer,
            401: ErrorSerializer,
            429: ErrorSerializer,
        },
    )
    def post(self, request: Request) -> Response:
        body = StaffTotpVerifyRequestSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        session, recovery_codes = services.verify_totp_challenge(
            body.validated_data["challenge_id"],
            code=body.validated_data.get("code", ""),
            recovery_code=body.validated_data.get("recovery_code", ""),
        )
        payload = {
            **SessionSerializer.describe(session),
            "recovery_codes": recovery_codes,
        }
        response = Response(StaffTotpSessionSerializer(payload).data)
        set_refresh_cookie(response, session)
        return response


class AdminMeView(AdminView):
    required_permissions = {"GET": ANY_STAFF}

    @extend_schema(
        operation_id="admin_me", tags=["admin"], responses={200: AdminMeSerializer, **REFUSED}
    )
    def get(self, request: Request) -> Response:
        return Response(AdminMeSerializer(request.user).data)


class RoleListView(AdminView):
    required_permissions = {"GET": Perm.MANAGE_STAFF}

    @extend_schema(
        operation_id="admin_roles",
        tags=["admin"],
        responses={200: RoleSerializer(many=True), **REFUSED},
    )
    def get(self, request: Request) -> Response:
        roles = [
            {"name": role.value, "permissions": sorted(p.value for p in perms)}
            for role, perms in ROLE_PERMISSIONS.items()
        ]
        return Response(RoleSerializer(roles, many=True).data)


@extend_schema_view(get=extend_schema(operation_id="admin_staff_list", tags=["admin"]))
class StaffListView(AdminView, ListAPIView):
    """Staff accounts, searchable by name or username."""

    required_permissions = {"GET": Perm.MANAGE_STAFF, "POST": Perm.MANAGE_STAFF}
    serializer_class = StaffSerializer
    queryset = User.objects.filter(is_staff=True).select_related("totp").prefetch_related("groups")
    search_fields = ["username", "first_name"]
    ordering_fields = ["username", "first_name", "last_login"]
    ordering = ["username"]

    @extend_schema(
        operation_id="admin_staff_create",
        tags=["admin"],
        request=StaffCreateSerializer,
        responses={201: StaffSerializer, 400: ErrorSerializer, 409: ErrorSerializer, **REFUSED},
    )
    def post(self, request: Request) -> Response:
        body = StaffCreateSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        user = services.create_staff(**body.validated_data)
        after = {
            **(audit.snapshot(user, STAFF_AUDIT_FIELDS) or {}),
            "roles": services.roles_of(user),
        }
        audit.change(request, "staff.create", user, before=None, after=after)
        return Response(StaffSerializer(user).data, status=status.HTTP_201_CREATED)


class StaffDetailView(AdminView, GenericAPIView):
    required_permissions = {"GET": Perm.MANAGE_STAFF, "PATCH": Perm.MANAGE_STAFF}
    serializer_class = StaffSerializer
    queryset = User.objects.filter(is_staff=True).select_related("totp").prefetch_related("groups")
    filter_backends: list = []

    @extend_schema(
        operation_id="admin_staff_read",
        tags=["admin"],
        responses={200: StaffSerializer, 404: ErrorSerializer, **REFUSED},
    )
    def get(self, request: Request, pk: int) -> Response:
        return Response(StaffSerializer(get_object_or_404(self.get_queryset(), pk=pk)).data)

    @extend_schema(
        operation_id="admin_staff_update",
        tags=["admin"],
        request=StaffUpdateSerializer,
        responses={
            200: StaffSerializer,
            400: ErrorSerializer,
            404: ErrorSerializer,
            409: ErrorSerializer,
            **REFUSED,
        },
    )
    def patch(self, request: Request, pk: int) -> Response:
        user = get_object_or_404(self.get_queryset(), pk=pk)
        before = {
            **(audit.snapshot(user, STAFF_AUDIT_FIELDS) or {}),
            "roles": services.roles_of(user),
        }
        body = StaffUpdateSerializer(data=request.data, partial=True)
        body.is_valid(raise_exception=True)
        assert isinstance(request.user, User)  # StaffAccess has already checked
        user = services.update_staff(request.user, user, **body.validated_data)
        after = {
            **(audit.snapshot(user, STAFF_AUDIT_FIELDS) or {}),
            "roles": services.roles_of(user),
        }
        audit.change(request, "staff.update", user, before=before, after=after)
        return Response(StaffSerializer(user).data)


class AdminStaffReset2FAView(AdminView, GenericAPIView):
    required_permissions = {"POST": Perm.MANAGE_STAFF}
    serializer_class = StaffSerializer
    queryset = User.objects.filter(is_staff=True).select_related("totp").prefetch_related("groups")
    filter_backends: list = []

    @extend_schema(
        operation_id="admin_staff_reset_2fa",
        tags=["admin"],
        request=None,
        responses={200: StaffSerializer, 404: ErrorSerializer, **REFUSED},
    )
    def post(self, request: Request, pk: int) -> Response:
        user = get_object_or_404(self.get_queryset(), pk=pk)
        had_totp = bool(getattr(user, "totp", None) and user.totp.confirmed_at is not None)
        assert isinstance(request.user, User)
        services.reset_2fa(request.user, user)
        refreshed = get_object_or_404(self.get_queryset(), pk=pk)
        audit.change(
            request,
            "staff.reset_2fa",
            refreshed,
            before={"totp_enabled": had_totp},
            after={"totp_enabled": False},
        )
        return Response(StaffSerializer(refreshed).data)
