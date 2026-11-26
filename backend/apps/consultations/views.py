from typing import Any, cast

from django.db.models import QuerySet
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import status as http_status
from rest_framework.generics import ListAPIView
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.patients.models import Patient
from apps.patients.permissions import IsPatient
from apps.staff.permissions import AdminView
from apps.staff.roles import Perm
from common.search import KeywordSearchFilter
from common.serializers import ErrorSerializer

from . import selectors, services
from .models import DoctorConsultation
from .serializers import (
    AdminConsultationDetailSerializer,
    AdminConsultationSummarySerializer,
    ConsultationSubmitSerializer,
    ConsultationWithdrawSerializer,
    PatientConsultationDetailSerializer,
    PatientConsultationSummarySerializer,
)

ADMIN_REFUSED = {401: ErrorSerializer, 403: ErrorSerializer}


class PatientConsultationListCreateView(APIView):
    permission_classes = [IsPatient]

    @extend_schema(
        operation_id="consultations_list",
        tags=["consultations"],
        responses={200: PatientConsultationSummarySerializer(many=True), 401: ErrorSerializer},
    )
    def get(self, request: Request) -> Response:
        cases = selectors.consultations_for_patient(cast(Patient, request.user))
        return Response(
            PatientConsultationSummarySerializer(
                cases, many=True, context={"request": request}
            ).data
        )

    @extend_schema(
        operation_id="consultations_create",
        tags=["consultations"],
        request=ConsultationSubmitSerializer,
        responses={
            201: PatientConsultationDetailSerializer,
            400: ErrorSerializer,
            401: ErrorSerializer,
            409: ErrorSerializer,
        },
    )
    def post(self, request: Request) -> Response:
        body = ConsultationSubmitSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        consultation = services.submit(patient=cast(Patient, request.user), **body.validated_data)
        detail = get_object_or_404(
            selectors.consultations_for_patient(cast(Patient, request.user)),
            pk=consultation.pk,
        )
        return Response(
            PatientConsultationDetailSerializer(detail, context={"request": request}).data,
            status=http_status.HTTP_201_CREATED,
        )


class PatientConsultationDetailView(APIView):
    permission_classes = [IsPatient]

    @extend_schema(
        operation_id="consultations_read",
        tags=["consultations"],
        responses={
            200: PatientConsultationDetailSerializer,
            401: ErrorSerializer,
            404: ErrorSerializer,
        },
    )
    def get(self, request: Request, pk: str) -> Response:
        case = get_object_or_404(
            selectors.consultations_for_patient(cast(Patient, request.user)), pk=pk
        )
        return Response(
            PatientConsultationDetailSerializer(case, context={"request": request}).data
        )


class PatientConsultationWithdrawView(APIView):
    permission_classes = [IsPatient]

    @extend_schema(
        operation_id="consultations_withdraw",
        tags=["consultations"],
        request=ConsultationWithdrawSerializer,
        responses={
            200: PatientConsultationDetailSerializer,
            400: ErrorSerializer,
            401: ErrorSerializer,
            404: ErrorSerializer,
            409: ErrorSerializer,
        },
    )
    def post(self, request: Request, pk: str) -> Response:
        body = ConsultationWithdrawSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        case = get_object_or_404(
            selectors.consultations_for_patient(cast(Patient, request.user)), pk=pk
        )
        updated = services.withdraw(
            case, cast(Patient, request.user), reason=body.validated_data.get("reason", "")
        )
        detail = get_object_or_404(
            selectors.consultations_for_patient(cast(Patient, request.user)), pk=updated.pk
        )
        return Response(
            PatientConsultationDetailSerializer(detail, context={"request": request}).data
        )


class AdminConsultationListView(AdminView, ListAPIView):
    required_permissions = {"GET": Perm.VIEW_CASES}
    serializer_class = AdminConsultationSummarySerializer
    filter_backends = [KeywordSearchFilter]
    search_fields = [
        "consultation_code",
        "chief_complaint",
        "patient__full_name",
        "patient__phone",
        "patient__location__display_name_en",
        "patient__location__display_name_bn",
        "assigned_doctor__full_name",
        "assigned_doctor__doctor_code",
    ]

    @extend_schema(
        operation_id="admin_consultations_list",
        tags=["admin"],
        parameters=[
            OpenApiParameter(name="q", type=str, required=False),
            OpenApiParameter(
                name="status",
                type=str,
                required=False,
                enum=[choice for choice, _ in DoctorConsultation.Status.choices],
            ),
        ],
        responses={200: AdminConsultationSummarySerializer(many=True), **ADMIN_REFUSED},
    )
    def get(self, request: Request, *args: Any, **kwargs: Any) -> Response:
        return super().get(request, *args, **kwargs)

    def get_queryset(self) -> QuerySet[DoctorConsultation]:
        if getattr(self, "swagger_fake_view", False):
            return DoctorConsultation.objects.none()
        return selectors.admin_consultations(
            status=self.request.query_params.get("status", ""),
        )


class AdminConsultationDetailView(AdminView, APIView):
    required_permissions = {"GET": Perm.VIEW_CASES}

    @extend_schema(
        operation_id="admin_consultations_read",
        tags=["admin"],
        responses={
            200: AdminConsultationDetailSerializer,
            **ADMIN_REFUSED,
            404: ErrorSerializer,
        },
    )
    def get(self, request: Request, pk: str) -> Response:
        case = get_object_or_404(selectors.admin_consultations(), pk=pk)
        return Response(AdminConsultationDetailSerializer(case, context={"request": request}).data)
