from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.cookies import set_refresh_cookie
from apps.accounts.serializers import SessionSerializer, VerificationSerializer
from apps.accounts.throttles import CodeAddressThrottle, LoginAddressThrottle, LoginPhoneThrottle
from apps.accounts.tokens import Session
from apps.accounts.views import CLIENT_HEADER, IsWebClient, PublicAuthView
from common.serializers import ErrorSerializer

from . import services
from .permissions import IsPatient
from .serializers import (
    ForgotPasswordSerializer,
    LogInSerializer,
    PatientSerializer,
    ResetPasswordSerializer,
    SignUpSerializer,
    VerifySerializer,
)


def _validated(serializer_class, request: Request) -> dict:
    serializer = serializer_class(data=request.data)
    serializer.is_valid(raise_exception=True)
    return serializer.validated_data


def _signed_in(session: Session) -> Response:
    response = Response(SessionSerializer.describe(session))
    set_refresh_cookie(response, session)
    return response


class SignUpView(PublicAuthView):
    throttle_classes = [CodeAddressThrottle]

    @extend_schema(
        operation_id="auth_patient_signup",
        tags=["auth"],
        request=SignUpSerializer,
        responses={
            201: VerificationSerializer,
            400: ErrorSerializer,
            409: ErrorSerializer,
            429: ErrorSerializer,
            503: ErrorSerializer,
        },
    )
    def post(self, request: Request) -> Response:
        challenge = services.sign_up(**_validated(SignUpSerializer, request))
        return Response(VerificationSerializer.describe(challenge), status=status.HTTP_201_CREATED)


class VerifyCodeView(PublicAuthView):
    """The code from sign-up. Success verifies the phone and signs in."""

    permission_classes = [IsWebClient]  # it sets the session cookie
    throttle_classes: list = []  # each code allows only a few tries

    @extend_schema(
        operation_id="auth_otp_verify",
        tags=["auth"],
        parameters=[CLIENT_HEADER],
        request=VerifySerializer,
        responses={200: SessionSerializer, 400: ErrorSerializer},
    )
    def post(self, request: Request) -> Response:
        return _signed_in(services.verify_sign_up(**_validated(VerifySerializer, request)))


class LogInView(PublicAuthView):
    permission_classes = [IsWebClient]  # it sets the session cookie
    throttle_classes = [LoginPhoneThrottle, LoginAddressThrottle]

    @extend_schema(
        operation_id="auth_patient_login",
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
        return _signed_in(services.log_in(**_validated(LogInSerializer, request)))


class ForgotPasswordView(PublicAuthView):
    throttle_classes = [CodeAddressThrottle]

    @extend_schema(
        operation_id="auth_password_forgot",
        tags=["auth"],
        request=ForgotPasswordSerializer,
        responses={200: VerificationSerializer, 400: ErrorSerializer, 429: ErrorSerializer},
    )
    def post(self, request: Request) -> Response:
        data = _validated(ForgotPasswordSerializer, request)
        return Response(
            VerificationSerializer.describe(services.start_password_reset(data["phone"]))
        )


class ResetPasswordView(PublicAuthView):
    throttle_classes: list = []

    @extend_schema(
        operation_id="auth_password_reset",
        tags=["auth"],
        request=ResetPasswordSerializer,
        responses={204: None, 400: ErrorSerializer},
    )
    def post(self, request: Request) -> Response:
        services.reset_password(**_validated(ResetPasswordSerializer, request))
        return Response(status=status.HTTP_204_NO_CONTENT)


class MeView(APIView):
    permission_classes = [IsPatient]

    @extend_schema(
        operation_id="me",
        tags=["account"],
        responses={200: PatientSerializer, 401: ErrorSerializer},
    )
    def get(self, request: Request) -> Response:
        return Response(PatientSerializer(request.user).data)
