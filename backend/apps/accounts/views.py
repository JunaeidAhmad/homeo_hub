from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import status
from rest_framework.permissions import AllowAny, BasePermission
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from common.errors import exception_handler
from common.serializers import ErrorSerializer

from . import otp, tokens
from .cookies import REFRESH_COOKIE, clear_refresh_cookie, set_refresh_cookie
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


class RefreshView(PublicAuthView):
    permission_classes = [IsWebClient]
    throttle_classes: list = []

    @extend_schema(
        operation_id="auth_refresh",
        tags=["auth"],
        parameters=[CLIENT_HEADER],
        request=None,
        responses={200: SessionSerializer, 401: ErrorSerializer},
    )
    def post(self, request: Request) -> Response:
        try:
            session = tokens.rotate(request.COOKIES.get(REFRESH_COOKIE, ""))
        except tokens.SessionExpired as error:
            response = exception_handler(error, {"request": request})
            assert response is not None
            clear_refresh_cookie(response)
            return response
        response = Response(SessionSerializer.describe(session))
        set_refresh_cookie(response, session)
        return response


class LogoutView(PublicAuthView):
    permission_classes = [IsWebClient]
    throttle_classes: list = []

    @extend_schema(
        operation_id="auth_logout",
        tags=["auth"],
        parameters=[CLIENT_HEADER],
        request=None,
        responses={204: None},
    )
    def post(self, request: Request) -> Response:
        tokens.close_session(request.COOKIES.get(REFRESH_COOKIE, ""))
        response = Response(status=status.HTTP_204_NO_CONTENT)
        clear_refresh_cookie(response)
        return response
