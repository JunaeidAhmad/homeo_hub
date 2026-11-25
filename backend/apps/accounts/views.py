from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import status
from rest_framework.permissions import AllowAny, BasePermission
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from common.errors import exception_handler
from common.serializers import ErrorSerializer

from . import otp, tokens
from .cookies import clear_refresh_cookie, refresh_cookie_name, set_refresh_cookie
from .serializers import ResendSerializer, SessionSerializer, VerificationSerializer
from .throttles import CodeAddressThrottle

CLIENT_HEADER = OpenApiParameter(
    "X-Client", str, OpenApiParameter.HEADER, required=True, enum=["web"]
)


class IsWebClient(BasePermission):
    """Cookie-authenticated endpoints need a header that another site cannot send (CSRF)."""

    message = "Send the X-Client: web header."

    def has_permission(self, request: Request, view) -> bool:
        return request.headers.get("X-Client") == "web"


class PublicAuthView(APIView):
    """Base for endpoints used before signing in."""

    authentication_classes: list = []
    permission_classes = [AllowAny]


class ResendCodeView(PublicAuthView):
    throttle_classes = [CodeAddressThrottle]

    @extend_schema(
        operation_id="auth_otp_resend",
        tags=["auth"],
        request=ResendSerializer,
        responses={200: VerificationSerializer, 400: ErrorSerializer, 429: ErrorSerializer},
    )
    def post(self, request: Request) -> Response:
        body = ResendSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        challenge, code = otp.reissue(body.validated_data["verification_id"])
        otp.deliver(challenge, code)
        return Response(VerificationSerializer.describe(challenge))


class _SessionCookieView(PublicAuthView):
    """Acts on one kind of user's refresh cookie."""

    user_type = "patient"
    permission_classes = [IsWebClient]
    throttle_classes: list = []

    def cookie(self, request: Request) -> str:
        return request.COOKIES.get(refresh_cookie_name(self.user_type), "")

    def refresh(self, request: Request) -> Response:
        try:
            session = tokens.rotate(self.cookie(request), self.user_type)
        except tokens.SessionExpired as error:
            response = exception_handler(error, {"request": request})
            assert response is not None
            clear_refresh_cookie(response, self.user_type)
            return response
        response = Response(SessionSerializer.describe(session))
        set_refresh_cookie(response, session)
        return response

    def sign_out(self, request: Request) -> Response:
        tokens.close_session(self.cookie(request))
        response = Response(status=status.HTTP_204_NO_CONTENT)
        clear_refresh_cookie(response, self.user_type)
        return response


def _refresh_schema(operation_id: str):
    return extend_schema(
        operation_id=operation_id,
        tags=["auth"],
        parameters=[CLIENT_HEADER],
        request=None,
        responses={200: SessionSerializer, 401: ErrorSerializer},
    )


def _logout_schema(operation_id: str):
    return extend_schema(
        operation_id=operation_id,
        tags=["auth"],
        parameters=[CLIENT_HEADER],
        request=None,
        responses={204: None},
    )


class RefreshView(_SessionCookieView):
    @_refresh_schema("auth_refresh")
    def post(self, request: Request) -> Response:
        return self.refresh(request)


class LogoutView(_SessionCookieView):
    @_logout_schema("auth_logout")
    def post(self, request: Request) -> Response:
        return self.sign_out(request)


class StaffRefreshView(_SessionCookieView):
    user_type = "staff"

    @_refresh_schema("auth_staff_refresh")
    def post(self, request: Request) -> Response:
        return self.refresh(request)


class StaffLogoutView(_SessionCookieView):
    user_type = "staff"

    @_logout_schema("auth_staff_logout")
    def post(self, request: Request) -> Response:
        return self.sign_out(request)
