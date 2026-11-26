from typing import cast

from django.http import Http404
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import PolymorphicProxySerializer, extend_schema
from rest_framework import status as http_status
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.billing.models import ConsultationInvoice
from apps.billing.selectors import is_unlocked
from apps.consultations.models import DoctorConsultation
from apps.doctors.models import Doctor
from apps.doctors.permissions import IsApprovedDoctor
from apps.orders.cart import add_prescription_to_cart
from apps.patients.models import Patient
from apps.patients.permissions import IsPatient
from common.serializers import ErrorSerializer

from . import selectors, services
from .serializers import (
    AddPrescriptionToCartResponseSerializer,
    DoctorPrescriptionWorkspaceSerializer,
    LockedPrescriptionSerializer,
    PrescriptionIssueSerializer,
    UnlockedPrescriptionSerializer,
    build_locked_payload,
)


def _doctor_workspace_payload(consultation: DoctorConsultation) -> dict:
    return {
        "consultation_status": consultation.status,
        "doctor": consultation.assigned_doctor,
        "latest": selectors.active_prescription(consultation),
        "versions": list(selectors.prescription_versions(consultation)),
    }


class DoctorPrescriptionView(APIView):
    permission_classes = [IsApprovedDoctor]

    @extend_schema(
        operation_id="doctor_prescription_read",
        tags=["doctor"],
        responses={
            200: DoctorPrescriptionWorkspaceSerializer,
            401: ErrorSerializer,
            403: ErrorSerializer,
            404: ErrorSerializer,
        },
    )
    def get(self, request: Request, pk: str) -> Response:
        doctor = cast(Doctor, request.user)
        case = get_object_or_404(
            DoctorConsultation.objects.select_related("assigned_doctor"),
            pk=pk,
            assigned_doctor=doctor,
        )
        return Response(
            DoctorPrescriptionWorkspaceSerializer(
                _doctor_workspace_payload(case),
                context={"request": request},
            ).data
        )

    @extend_schema(
        operation_id="doctor_prescription_issue",
        tags=["doctor"],
        request=PrescriptionIssueSerializer,
        responses={
            201: DoctorPrescriptionWorkspaceSerializer,
            400: ErrorSerializer,
            401: ErrorSerializer,
            403: ErrorSerializer,
            404: ErrorSerializer,
            409: ErrorSerializer,
        },
    )
    def post(self, request: Request, pk: str) -> Response:
        doctor = cast(Doctor, request.user)
        case = get_object_or_404(
            DoctorConsultation.objects.select_related("assigned_doctor"),
            pk=pk,
            assigned_doctor=doctor,
        )
        body = PrescriptionIssueSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        services.issue_prescription(case, doctor, **body.validated_data)
        case.refresh_from_db()
        return Response(
            DoctorPrescriptionWorkspaceSerializer(
                _doctor_workspace_payload(case),
                context={"request": request},
            ).data,
            status=http_status.HTTP_201_CREATED,
        )


class PatientPrescriptionView(APIView):
    permission_classes = [IsPatient]

    @extend_schema(
        operation_id="patient_prescription_read",
        tags=["consultations"],
        responses={
            200: PolymorphicProxySerializer(
                component_name="PatientPrescriptionResponse",
                serializers=[LockedPrescriptionSerializer, UnlockedPrescriptionSerializer],
                resource_type_field_name=None,
            ),
            401: ErrorSerializer,
            404: ErrorSerializer,
        },
    )
    def get(self, request: Request, pk: str) -> Response:
        patient = cast(Patient, request.user)
        case = get_object_or_404(DoctorConsultation, pk=pk, patient=patient)
        invoice = ConsultationInvoice.objects.filter(consultation=case).first()
        if invoice is None:
            raise Http404("Prescription not issued yet.")

        if not is_unlocked(case):
            header = selectors.active_prescription_header(case)
            if header is None:
                raise Http404("Prescription not issued yet.")
            return Response(
                LockedPrescriptionSerializer(build_locked_payload(header, invoice)).data
            )

        active = selectors.active_prescription(case)
        if active is None:
            raise Http404("Prescription not issued yet.")
        return Response(
            UnlockedPrescriptionSerializer(
                {
                    "locked": False,
                    "prescription": active,
                    "invoice": invoice,
                },
                context={"request": request},
            ).data
        )


class PatientPrescriptionAddToCartView(APIView):
    permission_classes = [IsPatient]

    @extend_schema(
        operation_id="patient_prescription_add_to_cart",
        tags=["consultations"],
        request=None,
        responses={
            200: AddPrescriptionToCartResponseSerializer,
            401: ErrorSerializer,
            403: ErrorSerializer,
            404: ErrorSerializer,
        },
    )
    def post(self, request: Request, pk: str) -> Response:
        patient = cast(Patient, request.user)
        case = get_object_or_404(DoctorConsultation, pk=pk, patient=patient)
        if selectors.active_prescription_header(case) is None:
            raise Http404("Prescription not issued yet.")
        cart, added_count, skipped = add_prescription_to_cart(patient, case)
        return Response(
            AddPrescriptionToCartResponseSerializer(
                {"cart": cart, "added_count": added_count, "skipped": skipped},
                context={"request": request},
            ).data
        )
