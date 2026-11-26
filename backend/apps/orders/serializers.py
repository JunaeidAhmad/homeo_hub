from collections.abc import Mapping
from typing import Any

from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from apps.remedies.choices import Potency, RemedyForm
from apps.remedies.models import Remedy
from apps.remedies.serializers import PictureUrlField
from common.i18n import localized_text

from .cart import PricedCart, PricedCartItem


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


# Re-export for schema helper clarity.
_ = extend_schema_field
