from datetime import timedelta

from django.db.models import QuerySet
from django.shortcuts import get_object_or_404
from django.utils import timezone
from drf_spectacular.utils import OpenApiParameter, extend_schema, extend_schema_view
from rest_framework.generics import GenericAPIView, ListAPIView
from rest_framework.request import Request
from rest_framework.response import Response

from apps.staff.permissions import AdminView
from apps.staff.roles import Perm
from common.serializers import ErrorSerializer

from . import services
from .models import ConsultationInvoice
from .serializers import AdminInvoiceReasonSerializer, AdminInvoiceSerializer

ADMIN_REFUSED = {401: ErrorSerializer, 403: ErrorSerializer}


def _admin_invoices_queryset() -> QuerySet[ConsultationInvoice]:
    return ConsultationInvoice.objects.select_related(
        "consultation",
        "consultation__patient",
        "consultation__assigned_doctor",
        "prescription__doctor",
        "waived_by",
        "closed_by",
    )


@extend_schema_view(
    get=extend_schema(
        operation_id="admin_invoices_list",
        tags=["admin"],
        parameters=[
            OpenApiParameter("q", str),
            OpenApiParameter(
                "status",
                str,
                enum=[choice for choice, _ in ConsultationInvoice.Status.choices],
            ),
            OpenApiParameter("older_than_days", int),
        ],
    )
)
class AdminInvoiceListView(AdminView, ListAPIView):
    required_permissions = {"GET": Perm.VIEW_PAYMENTS}
    serializer_class = AdminInvoiceSerializer
    search_fields = [
        "consultation__consultation_code",
        "consultation__patient__full_name",
        "consultation__patient__phone",
        "consultation__assigned_doctor__full_name",
    ]
    filterset_fields = ["status"]
    ordering_fields = ["created_at", "total_poisha", "status"]
    ordering = ["-created_at"]

    def get_queryset(self) -> QuerySet[ConsultationInvoice]:
        qs = _admin_invoices_queryset()
        raw_days = (self.request.query_params.get("older_than_days") or "").strip()
        if raw_days:
            try:
                days = max(0, int(raw_days))
            except ValueError:
                days = None
            if days is not None:
                cutoff = timezone.now() - timedelta(days=days)
                qs = qs.filter(
                    status=ConsultationInvoice.Status.UNPAID,
                    created_at__lte=cutoff,
                )
        return qs


class AdminInvoiceWaiveView(AdminView, GenericAPIView):
    required_permissions = {"POST": Perm.MANAGE_PAYMENTS}
    serializer_class = AdminInvoiceReasonSerializer
    filter_backends: list = []

    @extend_schema(
        operation_id="admin_invoices_waive",
        tags=["admin"],
        request=AdminInvoiceReasonSerializer,
        responses={
            200: AdminInvoiceSerializer,
            400: ErrorSerializer,
            **ADMIN_REFUSED,
            404: ErrorSerializer,
            409: ErrorSerializer,
        },
    )
    def post(self, request: Request, pk: str) -> Response:
        invoice = get_object_or_404(ConsultationInvoice, pk=pk)
        body = self.get_serializer(data=request.data)
        body.is_valid(raise_exception=True)
        updated = services.waive_invoice(
            invoice,
            request.user,  # type: ignore[arg-type]
            body.validated_data["reason"],
        )
        loaded = get_object_or_404(_admin_invoices_queryset(), pk=updated.pk)
        return Response(AdminInvoiceSerializer(loaded).data)


class AdminInvoiceCloseView(AdminView, GenericAPIView):
    required_permissions = {"POST": Perm.MANAGE_PAYMENTS}
    serializer_class = AdminInvoiceReasonSerializer
    filter_backends: list = []

    @extend_schema(
        operation_id="admin_invoices_close",
        tags=["admin"],
        request=AdminInvoiceReasonSerializer,
        responses={
            200: AdminInvoiceSerializer,
            400: ErrorSerializer,
            **ADMIN_REFUSED,
            404: ErrorSerializer,
            409: ErrorSerializer,
        },
    )
    def post(self, request: Request, pk: str) -> Response:
        invoice = get_object_or_404(ConsultationInvoice, pk=pk)
        body = self.get_serializer(data=request.data)
        body.is_valid(raise_exception=True)
        updated = services.close_invoice(
            invoice,
            request.user,  # type: ignore[arg-type]
            body.validated_data["reason"],
        )
        loaded = get_object_or_404(_admin_invoices_queryset(), pk=updated.pk)
        return Response(AdminInvoiceSerializer(loaded).data)
