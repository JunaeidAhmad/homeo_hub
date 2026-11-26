from django.shortcuts import get_object_or_404
from drf_spectacular.utils import OpenApiParameter, extend_schema, extend_schema_view
from rest_framework import status as http_status
from rest_framework.generics import GenericAPIView, ListCreateAPIView, RetrieveAPIView
from rest_framework.request import Request
from rest_framework.response import Response

from apps.illnesses.selectors import public_illnesses
from apps.patients.models import Patient
from apps.patients.permissions import IsPatient, IsVerifiedPatient
from common.serializers import ErrorSerializer

from . import cart as cart_service
from . import checkout as checkout_service
from .cart import IllnessNotFound
from .models import Cart, CartItem, Order
from .serializers import (
    AddCartItemSerializer,
    CartSerializer,
    CheckoutRequestSerializer,
    OrderQuoteRequestSerializer,
    OrderQuoteResponseSerializer,
    PatientOrderCardSerializer,
    PatientOrderDetailSerializer,
    UpdateCartItemSerializer,
)


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
        .prefetch_related("items__self_prescription_item__remedy", "history")
        .distinct()
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
