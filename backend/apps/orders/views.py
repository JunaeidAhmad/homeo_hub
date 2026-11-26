from django.contrib.auth.models import User
from django.db.models import Count, Q
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import OpenApiParameter, extend_schema, extend_schema_view
from rest_framework import status as http_status
from rest_framework.generics import GenericAPIView, ListAPIView, ListCreateAPIView, RetrieveAPIView
from rest_framework.request import Request
from rest_framework.response import Response

from apps.audit import services as audit
from apps.illnesses.selectors import public_illnesses
from apps.patients.models import Patient
from apps.patients.permissions import IsPatient, IsVerifiedPatient
from apps.staff.permissions import AdminView
from apps.staff.roles import Perm
from common.serializers import ErrorSerializer

from . import cart as cart_service
from . import checkout as checkout_service
from . import fulfilment
from .cart import IllnessNotFound
from .models import Cart, CartItem, Order, OrderItem, ShopAssignment
from .serializers import (
    AddCartItemSerializer,
    AdminAssignLineSerializer,
    AdminAssignmentStatusSerializer,
    AdminCancelOrderSerializer,
    AdminCandidateListingSerializer,
    AdminOrderDetailSerializer,
    AdminOrderSummarySerializer,
    CartSerializer,
    CheckoutRequestSerializer,
    OrderQuoteRequestSerializer,
    OrderQuoteResponseSerializer,
    PatientOrderCardSerializer,
    PatientOrderDetailSerializer,
    UpdateCartItemSerializer,
)

ADMIN_REFUSED = {401: ErrorSerializer, 403: ErrorSerializer}


class CartView(GenericAPIView):
    permission_classes = [IsPatient]
    serializer_class = CartSerializer
    filter_backends: list = []

    @extend_schema(
        operation_id="cart_read",
        tags=["cart"],
        responses={200: CartSerializer, 401: ErrorSerializer},
    )
    def get(self, request: Request) -> Response:
        assert isinstance(request.user, Patient)
        cart = cart_service.get_active_cart(request.user)
        return Response(CartSerializer.from_cart(cart, self.get_serializer_context()))


class CartItemAddView(GenericAPIView):
    permission_classes = [IsPatient]
    serializer_class = AddCartItemSerializer
    filter_backends: list = []

    @extend_schema(
        operation_id="cart_items_add",
        tags=["cart"],
        request=AddCartItemSerializer,
        responses={
            200: CartSerializer,
            400: ErrorSerializer,
            401: ErrorSerializer,
            404: ErrorSerializer,
            409: ErrorSerializer,
        },
    )
    def post(self, request: Request) -> Response:
        assert isinstance(request.user, Patient)
        body = self.get_serializer(data=request.data)
        body.is_valid(raise_exception=True)
        data = body.validated_data

        illness_id = data["illness_id"]
        if illness_id is None and data.get("illness_slug"):
            illness = public_illnesses().filter(slug=data["illness_slug"]).first()
            if illness is None:
                raise IllnessNotFound()
            illness_id = illness.id

        cart = cart_service.add_self_care_item(
            patient=request.user,
            remedy_id=data["remedy_id"],
            illness_id=illness_id,
            potency=data["potency"],
            form=data["form"],
            quantity=data["quantity"],
        )
        return Response(CartSerializer.from_cart(cart, self.get_serializer_context()))


class CartItemDetailView(GenericAPIView):
    permission_classes = [IsPatient]
    serializer_class = UpdateCartItemSerializer
    filter_backends: list = []

    def _get_item(self, request: Request, pk) -> CartItem:
        assert isinstance(request.user, Patient)
        return get_object_or_404(
            CartItem.objects.select_related("cart"),
            pk=pk,
            cart__patient=request.user,
            cart__status=Cart.Status.ACTIVE,
        )

    @extend_schema(
        operation_id="cart_items_update",
        tags=["cart"],
        request=UpdateCartItemSerializer,
        responses={
            200: CartSerializer,
            400: ErrorSerializer,
            401: ErrorSerializer,
            404: ErrorSerializer,
        },
    )
    def patch(self, request: Request, pk) -> Response:
        item = self._get_item(request, pk)
        body = self.get_serializer(data=request.data)
        body.is_valid(raise_exception=True)
        cart = cart_service.set_quantity(item, body.validated_data["quantity"])
        return Response(CartSerializer.from_cart(cart, self.get_serializer_context()))

    @extend_schema(
        operation_id="cart_items_remove",
        tags=["cart"],
        request=None,
        responses={200: CartSerializer, 401: ErrorSerializer, 404: ErrorSerializer},
    )
    def delete(self, request: Request, pk) -> Response:
        item = self._get_item(request, pk)
        cart = cart_service.remove_item(item)
        return Response(CartSerializer.from_cart(cart, self.get_serializer_context()))


class OrderQuoteView(GenericAPIView):
    permission_classes = [IsPatient]
    serializer_class = OrderQuoteRequestSerializer
    filter_backends: list = []

    @extend_schema(
        operation_id="orders_quote",
        tags=["orders"],
        request=OrderQuoteRequestSerializer,
        responses={200: OrderQuoteResponseSerializer, 400: ErrorSerializer, 401: ErrorSerializer},
    )
    def post(self, request: Request) -> Response:
        assert isinstance(request.user, Patient)
        body = self.get_serializer(data=request.data)
        body.is_valid(raise_exception=True)
        quote = checkout_service.quote_order(request.user, body.validated_data["location_id"])
        return Response(OrderQuoteResponseSerializer(quote).data)


def _patient_orders_queryset(patient: Patient):
    return (
        Order.objects.filter(patient=patient)
        .prefetch_related(
            "items__self_prescription_item__remedy",
            "items__prescription_item__remedy",
            "assignments",
            "history",
        )
        .distinct()
    )


def _admin_orders_queryset():
    return Order.objects.select_related("patient", "location").prefetch_related(
        "items__self_prescription_item__remedy",
        "items__prescription_item__remedy",
        "items__shop_assignment__shop",
        "items__shop_remedy",
        "assignments__shop",
        "assignments__items__self_prescription_item",
        "assignments__items__prescription_item",
        "history__changed_by",
        "history__shop_assignment__shop",
        "history__shop",
        "payments",
    )


@extend_schema_view(
    get=extend_schema(
        operation_id="orders_list",
        tags=["orders"],
        parameters=[OpenApiParameter("status", str)],
        responses={200: PatientOrderCardSerializer, 401: ErrorSerializer},
    ),
    post=extend_schema(
        operation_id="orders_create",
        tags=["orders"],
        parameters=[
            OpenApiParameter(
                "Idempotency-Key",
                str,
                location=OpenApiParameter.HEADER,
                required=False,
            )
        ],
        request=CheckoutRequestSerializer,
        responses={
            200: PatientOrderDetailSerializer,
            201: PatientOrderDetailSerializer,
            400: ErrorSerializer,
            401: ErrorSerializer,
            403: ErrorSerializer,
            409: ErrorSerializer,
        },
    ),
)
class OrderListCreateView(ListCreateAPIView):
    serializer_class = PatientOrderCardSerializer
    search_fields = ["code", "items__remedy_name"]
    ordering_fields = ["placed_at"]
    ordering = ["-placed_at"]

    def get_permissions(self):
        if self.request.method == "POST":
            return [IsVerifiedPatient()]
        return [IsPatient()]

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return Order.objects.none()
        assert isinstance(self.request.user, Patient)
        qs = _patient_orders_queryset(self.request.user)
        status_param = self.request.query_params.get("status", "")
        if status_param.strip():
            statuses = [part.strip() for part in status_param.split(",") if part.strip()]
            if statuses:
                qs = qs.filter(status__in=statuses)
        return qs

    def create(self, request: Request, *args, **kwargs) -> Response:
        assert isinstance(request.user, Patient)
        body = CheckoutRequestSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        data = body.validated_data
        order, created = checkout_service.checkout(
            patient=request.user,
            location=data["location_id"],
            address_line=data["address_line"],
            recipient_name=data["recipient_name"],
            phone=data["phone"],
            payment_method=data["payment_method"],
            idempotency_key=request.headers.get("Idempotency-Key"),
        )
        refreshed = _patient_orders_queryset(request.user).get(pk=order.pk)
        return Response(
            PatientOrderDetailSerializer(refreshed).data,
            status=http_status.HTTP_201_CREATED if created else http_status.HTTP_200_OK,
        )


@extend_schema_view(
    get=extend_schema(
        operation_id="orders_read",
        tags=["orders"],
        responses={200: PatientOrderDetailSerializer, 401: ErrorSerializer, 404: ErrorSerializer},
    )
)
class OrderDetailView(RetrieveAPIView):
    permission_classes = [IsPatient]
    serializer_class = PatientOrderDetailSerializer
    filter_backends: list = []

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return Order.objects.none()
        assert isinstance(self.request.user, Patient)
        return _patient_orders_queryset(self.request.user)


class OrderCancelView(GenericAPIView):
    permission_classes = [IsPatient]
    serializer_class = PatientOrderDetailSerializer
    filter_backends: list = []

    @extend_schema(
        operation_id="orders_cancel",
        tags=["orders"],
        request=None,
        responses={
            200: PatientOrderDetailSerializer,
            401: ErrorSerializer,
            404: ErrorSerializer,
            409: ErrorSerializer,
        },
    )
    def post(self, request: Request, pk) -> Response:
        assert isinstance(request.user, Patient)
        order = get_object_or_404(Order, pk=pk, patient=request.user)
        cancelled = checkout_service.cancel_by_patient(order)
        refreshed = _patient_orders_queryset(request.user).get(pk=cancelled.pk)
        return Response(PatientOrderDetailSerializer(refreshed).data)


# --- Admin fulfilment endpoints ----------------------------------------------------


@extend_schema_view(
    get=extend_schema(
        operation_id="admin_orders_list",
        tags=["admin"],
        parameters=[
            OpenApiParameter("status", str),
            OpenApiParameter("unassigned", bool),
        ],
    )
)
class AdminOrderListView(AdminView, ListAPIView):
    required_permissions = {"GET": Perm.VIEW_ORDERS}
    serializer_class = AdminOrderSummarySerializer
    search_fields = ["code", "patient__full_name", "patient__phone"]
    ordering_fields = ["placed_at", "total_poisha"]
    ordering = ["-placed_at"]

    def get_queryset(self):
        qs = (
            Order.objects.select_related("patient", "location")
            .annotate(
                unassigned_count=Count(
                    "items",
                    filter=Q(items__shop_assignment__isnull=True),
                    distinct=True,
                )
            )
            .distinct()
        )
        status_param = self.request.query_params.get("status", "")
        if status_param.strip():
            statuses = [s.strip() for s in status_param.split(",") if s.strip()]
            if statuses:
                qs = qs.filter(status__in=statuses)
        unassigned = self.request.query_params.get("unassigned", "").lower()
        if unassigned in ("true", "1"):
            qs = qs.filter(unassigned_count__gt=0).exclude(
                status__in=[Order.Status.CANCELLED, Order.Status.RETURNED]
            )
        return qs


@extend_schema_view(
    get=extend_schema(
        operation_id="admin_orders_read",
        tags=["admin"],
        responses={200: AdminOrderDetailSerializer, 404: ErrorSerializer, **ADMIN_REFUSED},
    )
)
class AdminOrderDetailView(AdminView, RetrieveAPIView):
    required_permissions = {"GET": Perm.VIEW_ORDERS}
    serializer_class = AdminOrderDetailSerializer
    filter_backends: list = []

    def get_queryset(self):
        return _admin_orders_queryset()

    def retrieve(self, request: Request, *args, **kwargs) -> Response:
        instance = self.get_object()
        audit.read(request, "order.read", instance)
        return Response(self.get_serializer(instance).data)


class AdminOrderItemCandidatesView(AdminView, GenericAPIView):
    required_permissions = {"GET": Perm.VIEW_ORDERS}
    serializer_class = AdminCandidateListingSerializer
    pagination_class = None
    filter_backends: list = []

    @extend_schema(
        operation_id="admin_order_item_candidates",
        tags=["admin"],
        responses={
            200: AdminCandidateListingSerializer(many=True),
            404: ErrorSerializer,
            **ADMIN_REFUSED,
        },
    )
    def get(self, request: Request, pk, item_id) -> Response:
        order = get_object_or_404(Order.objects.select_related("location"), pk=pk)
        item = get_object_or_404(
            OrderItem.objects.select_related("self_prescription_item", "prescription_item"),
            pk=item_id,
            order=order,
        )
        candidates = fulfilment.candidate_listings(order, item)
        return Response(self.get_serializer(candidates, many=True).data)


class AdminOrderItemAssignView(AdminView, GenericAPIView):
    required_permissions = {"POST": Perm.MANAGE_ORDERS, "DELETE": Perm.MANAGE_ORDERS}
    serializer_class = AdminOrderDetailSerializer
    filter_backends: list = []

    @extend_schema(
        operation_id="admin_order_item_assign",
        tags=["admin"],
        request=AdminAssignLineSerializer,
        responses={
            200: AdminOrderDetailSerializer,
            400: ErrorSerializer,
            404: ErrorSerializer,
            409: ErrorSerializer,
            **ADMIN_REFUSED,
        },
    )
    def post(self, request: Request, pk, item_id) -> Response:
        order = get_object_or_404(Order, pk=pk)
        item = get_object_or_404(OrderItem, pk=item_id, order=order)
        body = AdminAssignLineSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        assert isinstance(request.user, User)
        before = {
            "shop_remedy_id": item.shop_remedy_id,
            "order_status": order.status,
        }
        updated = fulfilment.assign_line(
            order, item, body.validated_data["shop_remedy"], request.user
        )
        item.refresh_from_db()
        audit.change(
            request,
            "order.assign_line",
            updated,
            before=before,
            after={
                "item_id": str(item.pk),
                "shop_remedy_id": item.shop_remedy_id,
                "order_status": updated.status,
            },
        )
        refreshed = _admin_orders_queryset().get(pk=updated.pk)
        return Response(AdminOrderDetailSerializer(refreshed).data)

    @extend_schema(
        operation_id="admin_order_item_unassign",
        tags=["admin"],
        request=None,
        responses={
            200: AdminOrderDetailSerializer,
            404: ErrorSerializer,
            409: ErrorSerializer,
            **ADMIN_REFUSED,
        },
    )
    def delete(self, request: Request, pk, item_id) -> Response:
        order = get_object_or_404(Order, pk=pk)
        item = get_object_or_404(OrderItem, pk=item_id, order=order)
        assert isinstance(request.user, User)
        before = {
            "item_id": str(item.pk),
            "shop_remedy_id": item.shop_remedy_id,
            "order_status": order.status,
        }
        updated = fulfilment.unassign_line(item, request.user)
        audit.change(
            request,
            "order.unassign_line",
            updated,
            before=before,
            after={"item_id": str(item.pk), "shop_remedy_id": None, "order_status": updated.status},
        )
        refreshed = _admin_orders_queryset().get(pk=updated.pk)
        return Response(AdminOrderDetailSerializer(refreshed).data)


class AdminShopAssignmentStatusView(AdminView, GenericAPIView):
    required_permissions = {"POST": Perm.MANAGE_ORDERS}
    serializer_class = AdminOrderDetailSerializer
    filter_backends: list = []

    @extend_schema(
        operation_id="admin_shop_assignment_status",
        tags=["admin"],
        request=AdminAssignmentStatusSerializer,
        responses={
            200: AdminOrderDetailSerializer,
            400: ErrorSerializer,
            404: ErrorSerializer,
            409: ErrorSerializer,
            **ADMIN_REFUSED,
        },
    )
    def post(self, request: Request, pk) -> Response:
        assignment = get_object_or_404(ShopAssignment, pk=pk)
        body = AdminAssignmentStatusSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        assert isinstance(request.user, User)
        before = {
            "assignment_id": str(assignment.pk),
            "status": assignment.status,
            "order_status": assignment.order.status,
        }
        updated = fulfilment.advance_assignment(
            assignment,
            body.validated_data["status"],
            request.user,
            cash_collected_poisha=body.validated_data.get("cash_collected_poisha"),
            note=body.validated_data.get("note", ""),
        )
        assignment.refresh_from_db()
        audit.change(
            request,
            "order.assignment.status",
            updated,
            before=before,
            after={
                "assignment_id": str(assignment.pk),
                "status": assignment.status,
                "order_status": updated.status,
            },
        )
        refreshed = _admin_orders_queryset().get(pk=updated.pk)
        return Response(AdminOrderDetailSerializer(refreshed).data)


class AdminOrderCancelView(AdminView, GenericAPIView):
    required_permissions = {"POST": Perm.MANAGE_ORDERS}
    serializer_class = AdminOrderDetailSerializer
    filter_backends: list = []

    @extend_schema(
        operation_id="admin_orders_cancel",
        tags=["admin"],
        request=AdminCancelOrderSerializer,
        responses={
            200: AdminOrderDetailSerializer,
            404: ErrorSerializer,
            409: ErrorSerializer,
            **ADMIN_REFUSED,
        },
    )
    def post(self, request: Request, pk) -> Response:
        order = get_object_or_404(Order, pk=pk)
        body = AdminCancelOrderSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        assert isinstance(request.user, User)
        before = audit.snapshot(order, ("status", "cancellation_reason"))
        updated = fulfilment.cancel_order(
            order,
            actor=request.user,
            by_patient=False,
            reason=body.validated_data.get("reason", ""),
        )
        audit.change(
            request,
            "order.cancel",
            updated,
            before=before,
            after=audit.snapshot(updated, ("status", "cancellation_reason")),
        )
        refreshed = _admin_orders_queryset().get(pk=updated.pk)
        return Response(AdminOrderDetailSerializer(refreshed).data)
