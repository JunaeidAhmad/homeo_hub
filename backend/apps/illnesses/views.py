from drf_spectacular.utils import OpenApiParameter, extend_schema, extend_schema_view
from rest_framework.generics import GenericAPIView, ListAPIView, ListCreateAPIView, RetrieveAPIView
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response

from apps.staff.permissions import AdminView
from apps.staff.roles import Perm
from common.serializers import ErrorSerializer

from . import services
from .models import IllnessRemedy
from .selectors import all_categories, all_illnesses, public_categories, public_illnesses
from .serializers import (
    AdminIllnessCategorySerializer,
    AdminIllnessRemedySerializer,
    AdminIllnessSerializer,
    AdminRankedRemediesInputSerializer,
    PublicIllnessCategorySerializer,
    PublicIllnessDetailSerializer,
)

MANAGE = Perm.MANAGE_ILLNESSES
REFUSED = {401: ErrorSerializer, 403: ErrorSerializer}


@extend_schema_view(get=extend_schema(operation_id="illness_categories_list", tags=["illnesses"]))
class IllnessCategoryListView(ListAPIView):
    """Active illness categories with their active illnesses. Public."""

    serializer_class = PublicIllnessCategorySerializer
    authentication_classes: list = []
    permission_classes = [AllowAny]
    pagination_class = None
    filter_backends: list = []

    def get_queryset(self):
        return public_categories()


@extend_schema_view(
    get=extend_schema(
        operation_id="illnesses_read",
        tags=["illnesses"],
        responses={200: PublicIllnessDetailSerializer, 404: ErrorSerializer},
    )
)
class IllnessDetailView(RetrieveAPIView):
    """One active illness with ranked active remedies. Public."""

    serializer_class = PublicIllnessDetailSerializer
    authentication_classes: list = []
    permission_classes = [AllowAny]
    lookup_field = "slug"

    def get_queryset(self):
        return public_illnesses()


@extend_schema_view(
    get=extend_schema(
        operation_id="admin_illness_categories_list",
        tags=["admin"],
        parameters=[OpenApiParameter("is_active", bool)],
    ),
    post=extend_schema(
        operation_id="admin_illness_categories_create",
        tags=["admin"],
        responses={
            201: AdminIllnessCategorySerializer,
            400: ErrorSerializer,
            409: ErrorSerializer,
        },
    ),
)
class AdminIllnessCategoryListView(AdminView, ListCreateAPIView):
    required_permissions = {"GET": MANAGE, "POST": MANAGE}
    serializer_class = AdminIllnessCategorySerializer
    search_fields = ["name_en", "name_bn", "slug"]
    filterset_fields = ["is_active"]
    ordering_fields = ["sort_order", "name_en", "is_active", "updated_at"]
    ordering = ["sort_order", "name_en"]

    def get_queryset(self):
        return all_categories()

    def perform_create(self, serializer) -> None:
        serializer.instance = services.create_category(**serializer.validated_data)


@extend_schema_view(
    get=extend_schema(operation_id="admin_illness_categories_read", tags=["admin"]),
    patch=extend_schema(
        operation_id="admin_illness_categories_update",
        tags=["admin"],
        responses={
            200: AdminIllnessCategorySerializer,
            400: ErrorSerializer,
            409: ErrorSerializer,
        },
    ),
)
class AdminIllnessCategoryDetailView(AdminView, GenericAPIView):
    required_permissions = {"GET": MANAGE, "PATCH": MANAGE}
    serializer_class = AdminIllnessCategorySerializer
    filter_backends: list = []

    def get_queryset(self):
        return all_categories()

    def get(self, request: Request, pk) -> Response:
        return Response(self.get_serializer(self.get_object()).data)

    def patch(self, request: Request, pk) -> Response:
        current = self.get_object()
        serializer = self.get_serializer(current, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        category = services.update_category(current, **serializer.validated_data)
        return Response(self.get_serializer(category).data)


@extend_schema_view(
    get=extend_schema(
        operation_id="admin_illnesses_list",
        tags=["admin"],
        parameters=[
            OpenApiParameter("category", str),
            OpenApiParameter("status", str, enum=["ACTIVE", "INACTIVE"]),
        ],
    ),
    post=extend_schema(
        operation_id="admin_illnesses_create",
        tags=["admin"],
        responses={201: AdminIllnessSerializer, 400: ErrorSerializer, 409: ErrorSerializer},
    ),
)
class AdminIllnessListView(AdminView, ListCreateAPIView):
    required_permissions = {"GET": MANAGE, "POST": MANAGE}
    serializer_class = AdminIllnessSerializer
    search_fields = ["name_en", "name_bn", "short_description_en", "short_description_bn"]
    filterset_fields = ["category", "status"]
    ordering_fields = ["name_en", "status", "updated_at"]
    ordering = ["name_en"]

    def get_queryset(self):
        return all_illnesses()

    def perform_create(self, serializer) -> None:
        serializer.instance = services.create_illness(**serializer.validated_data)


@extend_schema_view(
    get=extend_schema(operation_id="admin_illnesses_read", tags=["admin"]),
    patch=extend_schema(
        operation_id="admin_illnesses_update",
        tags=["admin"],
        responses={200: AdminIllnessSerializer, 400: ErrorSerializer, 409: ErrorSerializer},
    ),
)
class AdminIllnessDetailView(AdminView, GenericAPIView):
    required_permissions = {"GET": MANAGE, "PATCH": MANAGE}
    serializer_class = AdminIllnessSerializer
    filter_backends: list = []

    def get_queryset(self):
        return all_illnesses()

    def get(self, request: Request, pk) -> Response:
        return Response(self.get_serializer(self.get_object()).data)

    def patch(self, request: Request, pk) -> Response:
        current = self.get_object()
        serializer = self.get_serializer(current, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        illness = services.update_illness(current, **serializer.validated_data)
        return Response(self.get_serializer(illness).data)


class AdminIllnessRemediesView(AdminView, GenericAPIView):
    required_permissions = {"GET": MANAGE, "PUT": MANAGE}
    serializer_class = AdminIllnessRemedySerializer
    pagination_class = None
    filter_backends: list = []

    def get_queryset(self):
        return all_illnesses()

    @extend_schema(
        operation_id="admin_illnesses_remedies_list",
        tags=["admin"],
        responses={200: AdminIllnessRemedySerializer(many=True), **REFUSED},
    )
    def get(self, request: Request, pk) -> Response:
        illness = self.get_object()
        items = (
            IllnessRemedy.objects.filter(illness=illness).select_related("remedy").order_by("rank")
        )
        return Response(self.get_serializer(items, many=True).data)

    @extend_schema(
        operation_id="admin_illnesses_remedies_set",
        tags=["admin"],
        request=AdminRankedRemediesInputSerializer,
        responses={
            200: AdminIllnessRemedySerializer(many=True),
            400: ErrorSerializer,
            **REFUSED,
        },
    )
    def put(self, request: Request, pk) -> Response:
        illness = self.get_object()
        body = AdminRankedRemediesInputSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        items = services.set_ranked_remedies(illness, body.validated_data["remedy_ids"])
        return Response(self.get_serializer(items, many=True).data)
