import json
from collections.abc import Mapping
from typing import Any, cast

from django.core.files.uploadedfile import UploadedFile
from django.db.models import QuerySet
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import status as http_status
from rest_framework.exceptions import ErrorDetail, ValidationError
from rest_framework.generics import ListAPIView
from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.audit import services as audit
from apps.doctors.models import Doctor
from apps.doctors.permissions import IsApprovedDoctor
from apps.illnesses.models import IllnessCategory
from apps.patients.models import Patient
from apps.patients.permissions import IsPatient
from apps.staff.permissions import AdminView
from apps.staff.roles import Perm
from common.parsers import SafeJSONParser
from common.search import KeywordSearchFilter
from common.serializers import ErrorSerializer

from . import selectors, services
from .models import DoctorConsultation, QuestionSet, QuestionTemplate
from .serializers import (
    AdminAssignDoctorSerializer,
    AdminConsultationCategoriesUpdateSerializer,
    AdminConsultationDetailSerializer,
    AdminConsultationSummarySerializer,
    AdminQuestionTemplateSerializer,
    AdminQuestionTemplateWriteSerializer,
    AnswerBatchSubmitSerializer,
    AssignableDoctorSerializer,
    ConsultationCategorySerializer,
    ConsultationSubmitSerializer,
    ConsultationWithdrawSerializer,
    DoctorConsultationDetailSerializer,
    DoctorConsultationSummarySerializer,
    DoctorQuestionTemplateSerializer,
    PatientConsultationDetailSerializer,
    PatientConsultationSummarySerializer,
    QuestionSetCreateSerializer,
    QuestionSetSerializer,
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
        "patient__location__upazila_en",
        "patient__location__upazila_bn",
        "patient__location__district_en",
        "patient__location__district_bn",
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
    required_permissions = {"GET": Perm.VIEW_CASES, "PATCH": Perm.ASSIGN_CASES}

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
        audit.read(request, "consultation.read", case)
        return Response(AdminConsultationDetailSerializer(case, context={"request": request}).data)

    @extend_schema(
        operation_id="admin_consultations_update",
        tags=["admin"],
        request=AdminConsultationCategoriesUpdateSerializer,
        responses={
            200: AdminConsultationDetailSerializer,
            400: ErrorSerializer,
            **ADMIN_REFUSED,
            404: ErrorSerializer,
        },
    )
    def patch(self, request: Request, pk: str) -> Response:
        body = AdminConsultationCategoriesUpdateSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        case = get_object_or_404(DoctorConsultation.objects.prefetch_related("categories"), pk=pk)
        before = {"category_ids": [str(c.pk) for c in case.categories.all()]}
        updated = services.update_consultation_categories(case, body.validated_data["category_ids"])
        audit.change(
            request,
            "consultation.categories.update",
            updated,
            before=before,
            after={"category_ids": [str(c.pk) for c in updated.categories.all()]},
        )
        detail = get_object_or_404(selectors.admin_consultations(), pk=updated.pk)
        return Response(
            AdminConsultationDetailSerializer(detail, context={"request": request}).data
        )


class AdminConsultationAssignView(AdminView, APIView):
    required_permissions = {"POST": Perm.ASSIGN_CASES}

    @extend_schema(
        operation_id="admin_consultations_assign",
        tags=["admin"],
        request=AdminAssignDoctorSerializer,
        responses={
            200: AdminConsultationDetailSerializer,
            400: ErrorSerializer,
            **ADMIN_REFUSED,
            404: ErrorSerializer,
            409: ErrorSerializer,
        },
    )
    def post(self, request: Request, pk: str) -> Response:
        body = AdminAssignDoctorSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        case = get_object_or_404(DoctorConsultation, pk=pk)
        before = audit.snapshot(case, ["status", "assigned_doctor_id"])
        doctor = get_object_or_404(Doctor, pk=body.validated_data["doctor_id"])
        updated = services.assign(
            case,
            doctor,
            request.user,  # type: ignore[arg-type]
            note=body.validated_data.get("note", ""),
        )
        audit.change(
            request,
            "consultation.assign",
            updated,
            before=before,
            after=audit.snapshot(updated, ["status", "assigned_doctor_id"]),
        )
        detail = get_object_or_404(selectors.admin_consultations(), pk=updated.pk)
        return Response(
            AdminConsultationDetailSerializer(detail, context={"request": request}).data
        )


class AdminAssignableDoctorListView(AdminView, APIView):
    required_permissions = {"GET": Perm.ASSIGN_CASES}
    pagination_class = None

    @extend_schema(
        operation_id="admin_doctors_assignable",
        tags=["admin"],
        parameters=[
            OpenApiParameter(name="consultation_id", type=str, required=False),
            OpenApiParameter(name="q", type=str, required=False),
        ],
        responses={200: AssignableDoctorSerializer(many=True), **ADMIN_REFUSED},
    )
    def get(self, request: Request) -> Response:
        consultation_id = request.query_params.get("consultation_id", "").strip()
        consultation = (
            get_object_or_404(
                DoctorConsultation.objects.select_related("patient__location"),
                pk=consultation_id,
            )
            if consultation_id
            else None
        )
        rows = selectors.assignable_doctors(
            q=request.query_params.get("q", ""),
            consultation=consultation,
        )
        return Response(
            AssignableDoctorSerializer(rows, many=True, context={"request": request}).data
        )


class DoctorConsultationListView(APIView):
    permission_classes = [IsApprovedDoctor]
    pagination_class = None

    @extend_schema(
        operation_id="doctor_consultations_list",
        tags=["doctor"],
        parameters=[
            OpenApiParameter(name="q", type=str, required=False),
            OpenApiParameter(
                name="status",
                type=str,
                required=False,
                enum=[choice for choice, _ in DoctorConsultation.Status.choices],
            ),
        ],
        responses={
            200: DoctorConsultationSummarySerializer(many=True),
            401: ErrorSerializer,
            403: ErrorSerializer,
        },
    )
    def get(self, request: Request) -> Response:
        cases = selectors.cases_for_doctor(
            cast(Doctor, request.user),
            status=request.query_params.get("status", ""),
            q=request.query_params.get("q", ""),
        )
        return Response(
            DoctorConsultationSummarySerializer(cases, many=True, context={"request": request}).data
        )


class DoctorConsultationDetailView(APIView):
    permission_classes = [IsApprovedDoctor]

    @extend_schema(
        operation_id="doctor_consultations_read",
        tags=["doctor"],
        responses={
            200: DoctorConsultationDetailSerializer,
            401: ErrorSerializer,
            403: ErrorSerializer,
            404: ErrorSerializer,
        },
    )
    def get(self, request: Request, pk: str) -> Response:
        case = get_object_or_404(selectors.cases_for_doctor(cast(Doctor, request.user)), pk=pk)
        audit.read(request, "consultation.patient_record.read", case)
        return Response(DoctorConsultationDetailSerializer(case, context={"request": request}).data)


class DoctorConsultationOpenView(APIView):
    permission_classes = [IsApprovedDoctor]

    @extend_schema(
        operation_id="doctor_consultations_open",
        tags=["doctor"],
        request=None,
        responses={
            200: DoctorConsultationDetailSerializer,
            401: ErrorSerializer,
            403: ErrorSerializer,
            404: ErrorSerializer,
            409: ErrorSerializer,
        },
    )
    def post(self, request: Request, pk: str) -> Response:
        case = get_object_or_404(selectors.cases_for_doctor(cast(Doctor, request.user)), pk=pk)
        updated = services.open_case(case, cast(Doctor, request.user))
        detail = get_object_or_404(
            selectors.cases_for_doctor(cast(Doctor, request.user)), pk=updated.pk
        )
        return Response(
            DoctorConsultationDetailSerializer(detail, context={"request": request}).data
        )


class DoctorQuestionSetCreateView(APIView):
    permission_classes = [IsApprovedDoctor]

    @extend_schema(
        operation_id="doctor_consultations_send_questions",
        tags=["doctor"],
        request=QuestionSetCreateSerializer,
        responses={
            201: QuestionSetSerializer,
            400: ErrorSerializer,
            401: ErrorSerializer,
            403: ErrorSerializer,
            404: ErrorSerializer,
            409: ErrorSerializer,
        },
    )
    def post(self, request: Request, pk: str) -> Response:
        body = QuestionSetCreateSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        case = get_object_or_404(selectors.cases_for_doctor(cast(Doctor, request.user)), pk=pk)
        qset = services.send_questions(case, cast(Doctor, request.user), **body.validated_data)
        loaded = get_object_or_404(
            QuestionSet.objects.prefetch_related("questions__answer"), pk=qset.pk
        )
        return Response(
            QuestionSetSerializer(loaded, context={"request": request}).data,
            status=http_status.HTTP_201_CREATED,
        )


class PatientQuestionSetDetailView(APIView):
    permission_classes = [IsPatient]

    @extend_schema(
        operation_id="consultations_question_set_read",
        tags=["consultations"],
        responses={
            200: QuestionSetSerializer,
            401: ErrorSerializer,
            404: ErrorSerializer,
        },
    )
    def get(self, request: Request, pk: str, set_pk: str) -> Response:
        qset = get_object_or_404(
            QuestionSet.objects.prefetch_related("questions__answer"),
            pk=set_pk,
            consultation_id=pk,
            consultation__patient=cast(Patient, request.user),
        )
        return Response(QuestionSetSerializer(qset, context={"request": request}).data)


class PatientQuestionSetAnswersView(APIView):
    permission_classes = [IsPatient]
    parser_classes = [MultiPartParser, SafeJSONParser]

    @extend_schema(
        operation_id="consultations_question_set_answer",
        tags=["consultations"],
        request=AnswerBatchSubmitSerializer,
        responses={
            200: QuestionSetSerializer,
            400: ErrorSerializer,
            401: ErrorSerializer,
            404: ErrorSerializer,
            409: ErrorSerializer,
        },
    )
    def post(self, request: Request, pk: str, set_pk: str) -> Response:
        qset = get_object_or_404(
            QuestionSet.objects.prefetch_related("questions"),
            pk=set_pk,
            consultation_id=pk,
            consultation__patient=cast(Patient, request.user),
        )
        raw_answers: Any = (
            request.data.get("answers", []) if isinstance(request.data, Mapping) else []
        )
        if isinstance(raw_answers, str):
            try:
                raw_answers = json.loads(raw_answers)
            except json.JSONDecodeError as err:
                raise ValidationError(
                    {"answers": [ErrorDetail("Malformed answers payload.", code="invalid")]}
                ) from err
        body = AnswerBatchSubmitSerializer(data={"answers": raw_answers})
        body.is_valid(raise_exception=True)
        files = {
            str(key): value
            for key, value in request.FILES.items()
            if isinstance(value, UploadedFile)
        }
        updated = services.submit_answers(
            qset,
            cast(Patient, request.user),
            raw_answers=body.validated_data["answers"],
            files=files,
        )
        loaded = get_object_or_404(
            QuestionSet.objects.prefetch_related("questions__answer"), pk=updated.pk
        )
        return Response(QuestionSetSerializer(loaded, context={"request": request}).data)


class ConsultationCategoryListView(APIView):
    permission_classes = [AllowAny]

    @extend_schema(
        operation_id="consultation_categories_list",
        tags=["consultations"],
        responses={200: ConsultationCategorySerializer(many=True)},
    )
    def get(self, request: Request) -> Response:
        categories = IllnessCategory.objects.filter(is_active=True)
        return Response(
            ConsultationCategorySerializer(categories, many=True, context={"request": request}).data
        )


def _template_snapshot(template: QuestionTemplate) -> dict[str, Any]:
    return {
        "text_en": template.text_en,
        "text_bn": template.text_bn,
        "question_type": template.question_type,
        "options_en": template.options_en,
        "options_bn": template.options_bn,
        "required": template.required,
        "status": template.status,
        "category_ids": sorted(
            str(cid) for cid in template.categories.values_list("pk", flat=True)
        ),
    }


class AdminQuestionTemplateListView(AdminView, ListAPIView):
    required_permissions = {"GET": Perm.MANAGE_ILLNESSES, "POST": Perm.MANAGE_ILLNESSES}
    serializer_class = AdminQuestionTemplateSerializer
    filter_backends = [KeywordSearchFilter]
    search_fields = ["text_en", "text_bn"]

    @extend_schema(
        operation_id="admin_question_templates_list",
        tags=["admin"],
        parameters=[
            OpenApiParameter(name="q", type=str, required=False),
            OpenApiParameter(
                name="status",
                type=str,
                required=False,
                enum=[choice for choice, _ in QuestionTemplate.Status.choices],
            ),
            OpenApiParameter(name="category", type=str, required=False),
        ],
        responses={200: AdminQuestionTemplateSerializer(many=True), **ADMIN_REFUSED},
    )
    def get(self, request: Request, *args: Any, **kwargs: Any) -> Response:
        return super().get(request, *args, **kwargs)

    def get_queryset(self) -> QuerySet[QuestionTemplate]:
        if getattr(self, "swagger_fake_view", False):
            return QuestionTemplate.objects.none()
        return selectors.admin_question_templates(
            status=self.request.query_params.get("status", ""),
            category_id=self.request.query_params.get("category", ""),
        )

    @extend_schema(
        operation_id="admin_question_templates_create",
        tags=["admin"],
        request=AdminQuestionTemplateWriteSerializer,
        responses={
            201: AdminQuestionTemplateSerializer,
            400: ErrorSerializer,
            **ADMIN_REFUSED,
        },
    )
    def post(self, request: Request) -> Response:
        body = AdminQuestionTemplateWriteSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        created = services.create_question_template(**body.validated_data)
        audit.change(
            request,
            "question_template.create",
            created,
            before=None,
            after=_template_snapshot(created),
        )
        loaded = get_object_or_404(
            QuestionTemplate.objects.prefetch_related("categories"), pk=created.pk
        )
        return Response(
            AdminQuestionTemplateSerializer(loaded, context={"request": request}).data,
            status=http_status.HTTP_201_CREATED,
        )


class AdminQuestionTemplateDetailView(AdminView, APIView):
    required_permissions = {"GET": Perm.MANAGE_ILLNESSES, "PATCH": Perm.MANAGE_ILLNESSES}

    @extend_schema(
        operation_id="admin_question_templates_read",
        tags=["admin"],
        responses={
            200: AdminQuestionTemplateSerializer,
            404: ErrorSerializer,
            **ADMIN_REFUSED,
        },
    )
    def get(self, request: Request, pk: str) -> Response:
        template = get_object_or_404(QuestionTemplate.objects.prefetch_related("categories"), pk=pk)
        return Response(
            AdminQuestionTemplateSerializer(template, context={"request": request}).data
        )

    @extend_schema(
        operation_id="admin_question_templates_update",
        tags=["admin"],
        request=AdminQuestionTemplateWriteSerializer,
        responses={
            200: AdminQuestionTemplateSerializer,
            400: ErrorSerializer,
            404: ErrorSerializer,
            **ADMIN_REFUSED,
        },
    )
    def patch(self, request: Request, pk: str) -> Response:
        template = get_object_or_404(QuestionTemplate.objects.prefetch_related("categories"), pk=pk)
        before = _template_snapshot(template)
        body = AdminQuestionTemplateWriteSerializer(data=request.data, partial=True)
        body.is_valid(raise_exception=True)
        updated = services.update_question_template(template, **body.validated_data)
        audit.change(
            request,
            "question_template.update",
            updated,
            before=before,
            after=_template_snapshot(updated),
        )
        loaded = get_object_or_404(
            QuestionTemplate.objects.prefetch_related("categories"), pk=updated.pk
        )
        return Response(AdminQuestionTemplateSerializer(loaded, context={"request": request}).data)


class DoctorQuestionTemplatesView(APIView):
    permission_classes = [IsApprovedDoctor]

    @extend_schema(
        operation_id="doctor_consultations_question_templates",
        tags=["doctor"],
        parameters=[OpenApiParameter(name="q", type=str, required=False)],
        responses={
            200: DoctorQuestionTemplateSerializer(many=True),
            401: ErrorSerializer,
            403: ErrorSerializer,
            404: ErrorSerializer,
        },
    )
    def get(self, request: Request, pk: str) -> Response:
        case = get_object_or_404(
            DoctorConsultation.objects.prefetch_related("categories"),
            pk=pk,
            assigned_doctor=cast(Doctor, request.user),
        )
        rows = selectors.suggested_question_templates(case, q=request.query_params.get("q", ""))
        return Response(
            DoctorQuestionTemplateSerializer(rows, many=True, context={"request": request}).data
        )
