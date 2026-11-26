from drf_spectacular.utils import OpenApiParameter, extend_schema, extend_schema_view
from rest_framework import serializers
from rest_framework.generics import (
    GenericAPIView,
    ListAPIView,
    ListCreateAPIView,
    RetrieveAPIView,
)
from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response

from apps.audit import services as audit
from apps.staff.permissions import AdminView
from apps.staff.roles import Perm
from common.serializers import ErrorSerializer

from . import services
from .selectors import all_remedies, public_remedies
from .serializers import (
    AdminPriceInputSerializer,
    AdminRemedySerializer,
    PictureUploadSerializer,
    RemedyCardSerializer,
    RemedyDetailSerializer,
)

SEARCH_FIELDS = ["name", "name_bn", "indication_en", "indication_bn"]
REFUSED = {401: ErrorSerializer, 403: ErrorSerializer}
MANAGE = Perm.MANAGE_REMEDIES


@extend_schema_view(get=extend_schema(operation_id="remedies_list", tags=["remedies"]))
class RemedyListView(ListAPIView):
    """Active remedies. Public."""

    serializer_class = RemedyCardSerializer
    authentication_classes: list = []
    permission_classes = [AllowAny]
    search_fields = SEARCH_FIELDS
    ordering_fields = ["name"]
    ordering = ["name"]

    def get_queryset(self):
        return public_remedies()


@extend_schema_view(
    get=extend_schema(
        operation_id="remedies_read",
        tags=["remedies"],
        responses={200: RemedyDetailSerializer, 404: ErrorSerializer},
    )
)
class RemedyDetailView(RetrieveAPIView):
    """One active remedy. Public."""

    serializer_class = RemedyDetailSerializer
    authentication_classes: list = []
    permission_classes = [AllowAny]
    lookup_field = "slug"

    def get_queryset(self):
        return public_remedies()


REMEDY_AUDIT_FIELDS = [
    "name",
    "name_bn",
    "slug",
    "status",
    "description_en",
    "indication_en",
]


@extend_schema_view(
    get=extend_schema(
        operation_id="admin_remedies_list",
        tags=["admin"],
        parameters=[OpenApiParameter("status", str, enum=["DRAFT", "ACTIVE", "ARCHIVED"])],
    ),
    post=extend_schema(
        operation_id="admin_remedies_create",
        tags=["admin"],
        responses={201: AdminRemedySerializer, 400: ErrorSerializer, 409: ErrorSerializer},
    ),
)
class AdminRemedyListView(AdminView, ListCreateAPIView):
    required_permissions = {"GET": MANAGE, "POST": MANAGE}
    serializer_class = AdminRemedySerializer
    search_fields = SEARCH_FIELDS
    filterset_fields = ["status"]
    ordering_fields = ["name", "status", "updated_at"]
    ordering = ["name"]

    def get_queryset(self):
        return all_remedies()

    def perform_create(self, serializer) -> None:
        remedy = services.create_remedy(**serializer.validated_data)
        serializer.instance = remedy
        audit.change(
            self.request,
            "remedy.create",
            remedy,
            before=None,
            after=audit.snapshot(remedy, REMEDY_AUDIT_FIELDS),
        )


@extend_schema_view(
    get=extend_schema(operation_id="admin_remedies_read", tags=["admin"]),
    patch=extend_schema(
        operation_id="admin_remedies_update",
        tags=["admin"],
        responses={200: AdminRemedySerializer, 400: ErrorSerializer, 409: ErrorSerializer},
    ),
)
class AdminRemedyDetailView(AdminView, GenericAPIView):
    required_permissions = {"GET": MANAGE, "PATCH": MANAGE}
    serializer_class = AdminRemedySerializer
    filter_backends: list = []

    def get_queryset(self):
        return all_remedies()

    def get(self, request: Request, pk) -> Response:
        return Response(self.get_serializer(self.get_object()).data)

    def patch(self, request: Request, pk) -> Response:
        current = self.get_object()
        before = audit.snapshot(current, REMEDY_AUDIT_FIELDS)
        serializer = self.get_serializer(current, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        remedy = services.update_remedy(current, **serializer.validated_data)
        audit.change(
            request,
            "remedy.update",
            remedy,
            before=before,
            after=audit.snapshot(remedy, REMEDY_AUDIT_FIELDS),
        )
        return Response(self.get_serializer(remedy).data)


class AdminRemedyPictureView(AdminView, GenericAPIView):
    """Send the picture as multipart form data. (Safe from other sites: signing in here
    uses a header token, never a cookie.)"""

    required_permissions = {"PUT": MANAGE, "DELETE": MANAGE}
    serializer_class = AdminRemedySerializer
    parser_classes = [MultiPartParser]
    filter_backends: list = []

    def get_queryset(self):
        return all_remedies()

    @extend_schema(
        operation_id="admin_remedies_picture_set",
        tags=["admin"],
        request={"multipart/form-data": PictureUploadSerializer},
        responses={
            200: AdminRemedySerializer,
            400: ErrorSerializer,
            503: ErrorSerializer,
            **REFUSED,
        },
    )
    def put(self, request: Request, pk) -> Response:
        remedy = self.get_object()
        before = {"picture": bool(remedy.picture)}
        body = PictureUploadSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        services.set_picture(remedy, body.validated_data["picture"])
        audit.change(
            request,
            "remedy.picture.set",
            remedy,
            before=before,
            after={"picture": bool(remedy.picture)},
        )
        return Response(self.get_serializer(remedy).data)

    @extend_schema(
        operation_id="admin_remedies_picture_remove",
        tags=["admin"],
        request=None,
        responses={200: AdminRemedySerializer, **REFUSED},
    )
    def delete(self, request: Request, pk) -> Response:
        current = self.get_object()
        before = {"picture": bool(current.picture)}
        remedy = services.remove_picture(current)
        audit.change(
            request,
            "remedy.picture.remove",
            remedy,
            before=before,
            after={"picture": False},
        )
        return Response(self.get_serializer(remedy).data)


class AdminRemedyPricesView(AdminView, GenericAPIView):
    required_permissions = {"PUT": MANAGE}
    serializer_class = AdminRemedySerializer
    filter_backends: list = []

    def get_queryset(self):
        return all_remedies()

    @extend_schema(
        operation_id="admin_remedies_prices_set",
        tags=["admin"],
        request=AdminPriceInputSerializer(many=True),
        responses={200: AdminRemedySerializer, 400: ErrorSerializer, **REFUSED},
    )
    def put(self, request: Request, pk) -> Response:
        remedy = self.get_object()
        before = {
            p.form: {"price_poisha": p.price_poisha, "is_active": p.is_active}
            for p in remedy.prices.all()
        }
        body = AdminPriceInputSerializer(data=request.data, many=True)
        body.is_valid(raise_exception=True)
        forms = [item["form"] for item in body.validated_data]
        if len(forms) != len(set(forms)):
            raise serializers.ValidationError(
                {"non_field_errors": ["Each form may appear at most once."]}
            )
        updated = services.set_prices(remedy, body.validated_data)
        after = {
            p.form: {"price_poisha": p.price_poisha, "is_active": p.is_active}
            for p in updated.prices.all()
        }
        audit.change(request, "remedy.prices.update", updated, before=before, after=after)
        return Response(self.get_serializer(updated).data)
