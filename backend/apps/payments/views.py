import secrets

from django.conf import settings
from django.http import Http404, HttpRequest, HttpResponse
from django.shortcuts import get_object_or_404, redirect, render
from django.views import View
from drf_spectacular.utils import OpenApiParameter, extend_schema, extend_schema_view
from rest_framework import status as http_status
from rest_framework.generics import GenericAPIView, ListAPIView
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response

from apps.patients.models import Patient
from apps.patients.permissions import IsPatient, IsVerifiedPatient
from apps.staff.permissions import AdminView
from apps.staff.roles import Perm
from common.parsers import SafeJSONParser
from common.serializers import ErrorSerializer

from . import services
from .models import MockGatewaySession, Payment
from .serializers import (
    AdminPaymentSerializer,
    PatientPaymentStatusSerializer,
    PaymentStartRequestSerializer,
    PaymentStartResponseSerializer,
)

MOCK_GATEWAY_PATH = "apps.payments.gateways.mock.MockGateway"
ADMIN_REFUSED = {401: ErrorSerializer, 403: ErrorSerializer}


def _format_taka(poisha: int) -> str:
    if poisha % 100 == 0:
        return str(poisha // 100)
    return f"{poisha / 100:.2f}"


class PaymentStartView(GenericAPIView):
    permission_classes = [IsVerifiedPatient]
    serializer_class = PaymentStartRequestSerializer
    filter_backends: list = []

    @extend_schema(
        operation_id="payments_start",
        tags=["payments"],
        request=PaymentStartRequestSerializer,
        responses={
            201: PaymentStartResponseSerializer,
            400: ErrorSerializer,
            401: ErrorSerializer,
            403: ErrorSerializer,
            409: ErrorSerializer,
        },
    )
    def post(self, request: Request) -> Response:
        assert isinstance(request.user, Patient)
        body = self.get_serializer(data=request.data)
        body.is_valid(raise_exception=True)
        payment, gateway_url = services.start_payment(
            request.user,
            order=body.validated_data.get("order"),
            invoice=body.validated_data.get("invoice"),
        )
        return Response(
            PaymentStartResponseSerializer(
                {"tran_id": payment.tran_id, "gateway_url": gateway_url}
            ).data,
            status=http_status.HTTP_201_CREATED,
        )


class PaymentStatusView(GenericAPIView):
    permission_classes = [IsPatient]
    serializer_class = PatientPaymentStatusSerializer
    filter_backends: list = []

    @extend_schema(
        operation_id="payments_read",
        tags=["payments"],
        responses={200: PatientPaymentStatusSerializer, 401: ErrorSerializer, 404: ErrorSerializer},
    )
    def get(self, request: Request, tran_id: str) -> Response:
        assert isinstance(request.user, Patient)
        payment = get_object_or_404(
            Payment.objects.select_related("order", "invoice"),
            tran_id=tran_id,
            patient=request.user,
        )
        return Response(PatientPaymentStatusSerializer(payment).data)


class PaymentIpnView(GenericAPIView):
    authentication_classes: list = []
    permission_classes = [AllowAny]
    parser_classes = [FormParser, MultiPartParser, SafeJSONParser]
    filter_backends: list = []

    @extend_schema(
        operation_id="payments_ipn",
        tags=["payments"],
        request={"application/json": {"type": "object"}},
        responses={200: {"type": "object"}, 400: ErrorSerializer},
    )
    def post(self, request: Request) -> Response:
        payload = request.data if isinstance(request.data, dict) else dict(request.data)
        services.handle_ipn(payload)
        return Response({"status": "ok"})


class MockGatewayCheckoutView(View):
    """Server-rendered mock payment page. Returns 404 unless MockGateway is active."""

    def _session(self, session_key: str) -> MockGatewaySession:
        if settings.PAYMENT_GATEWAY != MOCK_GATEWAY_PATH:
            raise Http404("Mock gateway is disabled.")
        return get_object_or_404(MockGatewaySession, session_key=session_key)

    def get(self, request: HttpRequest, session_key: str) -> HttpResponse:
        session = self._session(session_key)
        return render(
            request,
            "payments/mock_checkout.html",
            {"session": session, "amount_taka": _format_taka(session.amount_poisha)},
        )

    def post(self, request: HttpRequest, session_key: str) -> HttpResponse:
        session = self._session(session_key)
        action = (request.POST.get("action") or "").strip().upper()
        if action not in {"SUCCESS", "FAILED", "CANCELLED"}:
            raise Http404("Unknown action.")
        session.outcome = action
        if not session.val_id:
            session.val_id = f"MOCK-VAL-{secrets.token_hex(8).upper()}"
        session.save(update_fields=["outcome", "val_id"])
        services.handle_ipn(
            {
                "tran_id": session.tran_id,
                "val_id": session.val_id,
                "status": action,
            }
        )
        return redirect(session.return_url or f"/payments/result?tran_id={session.tran_id}")


@extend_schema_view(
    get=extend_schema(
        operation_id="admin_payments_list",
        tags=["admin"],
        parameters=[
            OpenApiParameter("status", str),
            OpenApiParameter("method", str, enum=["COD", "ONLINE"]),
            OpenApiParameter("is_flagged", bool),
        ],
    )
)
class AdminPaymentListView(AdminView, ListAPIView):
    required_permissions = {"GET": Perm.VIEW_PAYMENTS}
    serializer_class = AdminPaymentSerializer
    search_fields = [
        "tran_id",
        "order__code",
        "invoice__consultation__consultation_code",
        "patient__full_name",
        "patient__phone",
    ]
    filterset_fields = ["status", "method", "is_flagged"]
    ordering_fields = ["created_at", "amount_poisha", "status"]
    ordering = ["-created_at"]

    def get_queryset(self):
        return Payment.objects.select_related("order", "invoice__consultation", "patient").all()
