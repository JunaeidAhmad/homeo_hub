from collections.abc import Mapping
from typing import Any

from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from apps.locations.models import Location
from apps.remedies.choices import Potency, RemedyForm
from apps.remedies.models import Remedy
from apps.remedies.serializers import PictureUrlField
from common.fields import PhoneField
from common.i18n import localized_text

from .cart import PricedCart, PricedCartItem
from .checkout import CANCELLABLE_STATUSES
from .models import Order, OrderItem, OrderStatusHistory


class CartRemedySerializer(serializers.ModelSerializer):
    picture_url = PictureUrlField()

    class Meta:
        model = Remedy
        fields = ["name", "name_bn", "slug", "picture_url"]


class CartItemSerializer(serializers.Serializer):
    id = serializers.UUIDField(source="item.id", read_only=True)
    remedy = CartRemedySerializer(read_only=True)
    illness_name = serializers.SerializerMethodField()
    potency = serializers.ChoiceField(choices=Potency.choices, read_only=True)
    form = serializers.ChoiceField(choices=RemedyForm.choices, read_only=True)
    quantity = serializers.IntegerField(source="item.quantity", read_only=True)
    unit_price_poisha = serializers.IntegerField(read_only=True)
    line_total_poisha = serializers.IntegerField(read_only=True)
    available = serializers.BooleanField(read_only=True)

    def get_illness_name(self, priced: PricedCartItem) -> str | None:
        if priced.illness is None:
            return None
        return localized_text(priced.illness, "name")


class CartSerializer(serializers.Serializer):
    id = serializers.UUIDField(source="cart.id", read_only=True)
    items = CartItemSerializer(many=True, read_only=True)
    item_count = serializers.IntegerField(read_only=True)
    subtotal_poisha = serializers.IntegerField(read_only=True)
    max_quantity = serializers.IntegerField(read_only=True)

    @staticmethod
    def from_cart(cart: Any, context: Mapping[str, Any] | None = None) -> dict[str, Any]:
        from .cart import price_cart

        priced: PricedCart = price_cart(cart)
        serializer = CartSerializer(priced, context=dict(context or {}))
        return dict(serializer.data)


class AddCartItemSerializer(serializers.Serializer):
    remedy_id = serializers.UUIDField()
    illness_id = serializers.UUIDField(required=False, allow_null=True, default=None)
    illness_slug = serializers.SlugField(
        max_length=160, required=False, allow_null=True, allow_blank=True, default=None
    )
    potency = serializers.ChoiceField(choices=Potency.choices)
    form = serializers.ChoiceField(choices=RemedyForm.choices)
    quantity = serializers.IntegerField(default=1, min_value=1, max_value=10)


class UpdateCartItemSerializer(serializers.Serializer):
    quantity = serializers.IntegerField()


class OrderQuoteRequestSerializer(serializers.Serializer):
    location_id = serializers.PrimaryKeyRelatedField(queryset=Location.objects.all())


class OrderQuoteResponseSerializer(serializers.Serializer):
    subtotal_poisha = serializers.IntegerField()
    delivery_charge_poisha = serializers.IntegerField()
    total_poisha = serializers.IntegerField()


class CheckoutRequestSerializer(serializers.Serializer):
    location_id = serializers.PrimaryKeyRelatedField(queryset=Location.objects.all())
    recipient_name = serializers.CharField(max_length=120)
    phone = PhoneField()
    address_line = serializers.CharField(max_length=500)
    payment_method = serializers.ChoiceField(choices=Order.PaymentMethod.choices)


class ShippingAddressSerializer(serializers.Serializer):
    recipient_name = serializers.CharField()
    phone = serializers.CharField()
    address_line = serializers.CharField()
    area_en = serializers.CharField()
    area_bn = serializers.CharField()


class PatientOrderItemSerializer(serializers.ModelSerializer):
    remedy_name_bn = serializers.SerializerMethodField()
    remedy_slug = serializers.SerializerMethodField()
    potency = serializers.SerializerMethodField()
    form = serializers.SerializerMethodField()

    class Meta:
        model = OrderItem
        fields = [
            "id",
            "remedy_name",
            "remedy_name_bn",
            "remedy_slug",
            "potency",
            "form",
            "quantity",
            "unit_price_poisha",
            "line_total_poisha",
        ]

    def get_remedy_name_bn(self, item: OrderItem) -> str:
        if item.self_prescription_item:
            return item.self_prescription_item.remedy.name_bn
        return ""

    def get_remedy_slug(self, item: OrderItem) -> str | None:
        if item.self_prescription_item:
            return item.self_prescription_item.remedy.slug
        return None

    @extend_schema_field(serializers.ChoiceField(choices=Potency.choices, allow_null=True))
    def get_potency(self, item: OrderItem) -> str | None:
        return item.self_prescription_item.potency if item.self_prescription_item else None

    @extend_schema_field(serializers.ChoiceField(choices=RemedyForm.choices, allow_null=True))
    def get_form(self, item: OrderItem) -> str | None:
        return item.self_prescription_item.form if item.self_prescription_item else None


class OrderTimelineEntrySerializer(serializers.ModelSerializer):
    status = serializers.ChoiceField(source="to_status", choices=Order.Status.choices)
    at = serializers.DateTimeField(source="created_at")

    class Meta:
        model = OrderStatusHistory
        fields = ["status", "at"]


class PatientOrderCardSerializer(serializers.ModelSerializer):
    item_count = serializers.SerializerMethodField()

    class Meta:
        model = Order
        fields = ["id", "code", "placed_at", "item_count", "total_poisha", "status"]

    def get_item_count(self, order: Order) -> int:
        return sum(item.quantity for item in order.items.all())


class PatientOrderDetailSerializer(serializers.ModelSerializer):
    shipping_address = ShippingAddressSerializer(read_only=True)
    items = PatientOrderItemSerializer(many=True, read_only=True)
    can_cancel = serializers.SerializerMethodField()
    timeline = serializers.SerializerMethodField()

    class Meta:
        model = Order
        fields = [
            "id",
            "code",
            "placed_at",
            "cancelled_at",
            "status",
            "payment_method",
            "shipping_address",
            "subtotal_poisha",
            "delivery_charge_poisha",
            "total_poisha",
            "can_cancel",
            "items",
            "timeline",
        ]

    def get_can_cancel(self, order: Order) -> bool:
        return order.status in CANCELLABLE_STATUSES

    @extend_schema_field(OrderTimelineEntrySerializer(many=True))
    def get_timeline(self, order: Order) -> list[dict[str, Any]]:
        rows = order.history.all()
        return list(OrderTimelineEntrySerializer(rows, many=True).data)
