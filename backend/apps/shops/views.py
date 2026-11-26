from django.contrib.auth.models import User
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import OpenApiParameter, extend_schema, extend_schema_view
from rest_framework import status
from rest_framework.generics import GenericAPIView, ListAPIView, ListCreateAPIView
from rest_framework.request import Request
from rest_framework.response import Response

from apps.staff.permissions import AdminView
from apps.staff.roles import Perm, Role
from common.serializers import ErrorSerializer

from . import services
from .models import Shop, ShopRemedy, ShopStaff
from .selectors import shops_for
from .serializers import (
    AdminShopRemedySerializer,
    AdminShopRemedyUpdateSerializer,
    AdminShopSerializer,
    AdminShopStaffCandidateSerializer,
    AdminShopStaffInputSerializer,
    AdminShopStaffSerializer,
)

BOTH_SHOP_PERMS = (Perm.MANAGE_SHOPS, Perm.MANAGE_OWN_SHOP)
MANAGE = Perm.MANAGE_SHOPS
REFUSED = {401: ErrorSerializer, 403: ErrorSerializer}


@extend_schema_view(
    get=extend_schema(
        operation_id="admin_shops_list",
        tags=["admin"],
        parameters=[
            OpenApiParameter("is_active", bool),
            OpenApiParameter("is_verified", bool),
        ],
    ),
    post=extend_schema(
        operation_id="admin_shops_create",
        tags=["admin"],
        responses={201: AdminShopSerializer, 400: ErrorSerializer, 409: ErrorSerializer, **REFUSED},
    ),
)
class AdminShopListView(AdminView, ListCreateAPIView):
    required_permissions = {"GET": BOTH_SHOP_PERMS, "POST": MANAGE}
    serializer_class = AdminShopSerializer
    search_fields = [
        "name",
        "phone",
        "location__upazila_en",
        "location__upazila_bn",
        "location__district_en",
        "location__district_bn",
    ]
    filterset_fields = ["is_active", "is_verified"]
    ordering_fields = ["name", "is_verified", "is_active", "updated_at"]
    ordering = ["name"]

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return Shop.objects.none()
        return shops_for(self.request.user)

    def perform_create(self, serializer) -> None:
        serializer.instance = services.create_shop(**serializer.validated_data)


@extend_schema_view(
    get=extend_schema(operation_id="admin_shops_read", tags=["admin"]),
    patch=extend_schema(
        operation_id="admin_shops_update",
        tags=["admin"],
        responses={200: AdminShopSerializer, 400: ErrorSerializer, 409: ErrorSerializer, **REFUSED},
    ),
)
class AdminShopDetailView(AdminView, GenericAPIView):
    required_permissions = {"GET": BOTH_SHOP_PERMS, "PATCH": MANAGE}
    serializer_class = AdminShopSerializer
    filter_backends: list = []

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return Shop.objects.none()
        return shops_for(self.request.user)

    def get(self, request: Request, pk) -> Response:
        return Response(self.get_serializer(self.get_object()).data)

    def patch(self, request: Request, pk) -> Response:
        current = self.get_object()
        serializer = self.get_serializer(current, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        updated = services.update_shop(current, **serializer.validated_data)
        return Response(self.get_serializer(updated).data)


class AdminShopStaffListView(AdminView, GenericAPIView):
    required_permissions = {"GET": MANAGE, "POST": MANAGE}
    serializer_class = AdminShopStaffSerializer
    pagination_class = None
    filter_backends: list = []

    def _shop(self, pk) -> Shop:
        return get_object_or_404(Shop, pk=pk)

    @extend_schema(
        operation_id="admin_shop_staff_list",
        tags=["admin"],
        responses={200: AdminShopStaffSerializer(many=True), 404: ErrorSerializer, **REFUSED},
    )
    def get(self, request: Request, pk) -> Response:
        shop = self._shop(pk)
        links = shop.staff_links.select_related("user").all()
        return Response(self.get_serializer(links, many=True).data)

    @extend_schema(
        operation_id="admin_shop_staff_add",
        tags=["admin"],
        request=AdminShopStaffInputSerializer,
        responses={
            201: AdminShopStaffSerializer,
            400: ErrorSerializer,
            404: ErrorSerializer,
            409: ErrorSerializer,
            **REFUSED,
        },
    )
    def post(self, request: Request, pk) -> Response:
        shop = self._shop(pk)
        body = AdminShopStaffInputSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        link = services.link_staff(
            shop=shop,
            user=body.validated_data["user"],
            role=body.validated_data["role"],
        )
        return Response(self.get_serializer(link).data, status=status.HTTP_201_CREATED)


class AdminShopStaffDetailView(AdminView, GenericAPIView):
    required_permissions = {"DELETE": MANAGE}
    serializer_class = AdminShopStaffSerializer
    filter_backends: list = []

    @extend_schema(
        operation_id="admin_shop_staff_remove",
        tags=["admin"],
        request=None,
        responses={204: None, 404: ErrorSerializer, **REFUSED},
    )
    def delete(self, request: Request, pk, link_id) -> Response:
        link = get_object_or_404(ShopStaff, pk=link_id, shop_id=pk)
        services.unlink_staff(link)
        return Response(status=status.HTTP_204_NO_CONTENT)


@extend_schema_view(get=extend_schema(operation_id="admin_shop_staff_candidates", tags=["admin"]))
class AdminShopStaffCandidatesView(AdminView, ListAPIView):
    required_permissions = {"GET": MANAGE}
    serializer_class = AdminShopStaffCandidateSerializer
    pagination_class = None
    search_fields = ["username", "first_name"]
    ordering = ["username"]

    def get_queryset(self):
        return (
            User.objects.filter(
                is_staff=True,
                is_active=True,
                groups__name=Role.SHOP_OWNER.value,
            )
            .distinct()
            .order_by("username")
        )


@extend_schema_view(
    get=extend_schema(
        operation_id="admin_shop_remedies_list",
        tags=["admin"],
        parameters=[OpenApiParameter("is_available", bool)],
    ),
    post=extend_schema(
        operation_id="admin_shop_remedies_create",
        tags=["admin"],
        responses={
            201: AdminShopRemedySerializer,
            400: ErrorSerializer,
            404: ErrorSerializer,
            409: ErrorSerializer,
            **REFUSED,
        },
    ),
)
class AdminShopRemedyListView(AdminView, ListCreateAPIView):
    required_permissions = {"GET": BOTH_SHOP_PERMS, "POST": BOTH_SHOP_PERMS}
    serializer_class = AdminShopRemedySerializer
    search_fields = ["remedy__name", "remedy__name_bn"]
    filterset_fields = ["is_available"]
    ordering_fields = ["remedy__name", "pack_size", "price_poisha", "stock_qty", "updated_at"]
    ordering = ["remedy__name", "pack_size"]

    def _shop(self) -> Shop:
        return get_object_or_404(shops_for(self.request.user), pk=self.kwargs["pk"])

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return ShopRemedy.objects.none()
        shop = self._shop()
        return ShopRemedy.objects.filter(shop=shop).select_related("remedy", "shop")

    def perform_create(self, serializer) -> None:
        shop = self._shop()
        serializer.instance = services.create_listing(shop=shop, **serializer.validated_data)


class AdminShopRemedyDetailView(AdminView, GenericAPIView):
    required_permissions = {"PATCH": BOTH_SHOP_PERMS, "DELETE": BOTH_SHOP_PERMS}
    serializer_class = AdminShopRemedySerializer
    filter_backends: list = []

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return ShopRemedy.objects.none()
        return ShopRemedy.objects.filter(shop__in=shops_for(self.request.user)).select_related(
            "remedy", "shop"
        )

    @extend_schema(
        operation_id="admin_shop_remedies_update",
        tags=["admin"],
        request=AdminShopRemedyUpdateSerializer,
        responses={
            200: AdminShopRemedySerializer,
            400: ErrorSerializer,
            404: ErrorSerializer,
            409: ErrorSerializer,
            **REFUSED,
        },
    )
    def patch(self, request: Request, pk) -> Response:
        listing = self.get_object()
        body = AdminShopRemedyUpdateSerializer(data=request.data, partial=True)
        body.is_valid(raise_exception=True)
        updated = services.update_listing(listing, **body.validated_data)
        return Response(self.get_serializer(updated).data)

    @extend_schema(
        operation_id="admin_shop_remedies_delete",
        tags=["admin"],
        request=None,
        responses={204: None, 404: ErrorSerializer, 409: ErrorSerializer, **REFUSED},
    )
    def delete(self, request: Request, pk) -> Response:
        listing = self.get_object()
        services.delete_listing(listing)
        return Response(status=status.HTTP_204_NO_CONTENT)
