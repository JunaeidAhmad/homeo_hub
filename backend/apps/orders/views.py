from django.shortcuts import get_object_or_404
from drf_spectacular.utils import extend_schema
from rest_framework.generics import GenericAPIView
from rest_framework.request import Request
from rest_framework.response import Response

from apps.illnesses.selectors import public_illnesses
from apps.patients.models import Patient
from apps.patients.permissions import IsPatient
from common.serializers import ErrorSerializer

from . import cart as cart_service
from .cart import IllnessNotFound
from .models import Cart, CartItem
from .serializers import AddCartItemSerializer, CartSerializer, UpdateCartItemSerializer


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
