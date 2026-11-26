from collections.abc import Mapping
from typing import Any

from django.utils import timezone
from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from apps.locations.models import Location
from apps.payments.models import Payment
from apps.remedies.choices import Potency, RemedyForm
from apps.remedies.models import Remedy
from apps.remedies.serializers import PictureUrlField
from apps.shops.models import ShopRemedy
from common.fields import PhoneField
from common.i18n import localized_text

from .cart import PricedCart, PricedCartItem
from .fulfilment import CandidateListing, can_cancel_order, expected_cod, next_statuses_for
from .models import Order, OrderItem, OrderStatusHistory, ShopAssignment


class CartRemedySerializer(serializers.ModelSerializer):
    picture_url = PictureUrlField()

    class Meta:
        model = Remedy
        fields = ["name", "name_bn", "slug", "picture_url"]


class CartItemSerializer(serializers.Serializer):
    id = serializers.UUIDField(source="item.id", read_only=True)
    remedy = CartRemedySerializer(read_only=True)
    illness_name = serializers.SerializerMethodField()
    source_label = serializers.SerializerMethodField()
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

    def get_source_label(self, priced: PricedCartItem) -> str | None:
        if priced.prescribed_by_name:
            return f"Prescribed by Dr {priced.prescribed_by_name}"
        if priced.illness is not None:
            return localized_text(priced.illness, "name")
        return None


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
        source = item.source_line
        if source and source.remedy:
            return source.remedy.name_bn
        return ""

    def get_remedy_slug(self, item: OrderItem) -> str | None:
        source = item.source_line
        if source and source.remedy:
            return source.remedy.slug
        return None

    @extend_schema_field(serializers.ChoiceField(choices=Potency.choices, allow_null=True))
    def get_potency(self, item: OrderItem) -> str | None:
        source = item.source_line
        return source.potency if source else None

    @extend_schema_field(serializers.ChoiceField(choices=RemedyForm.choices, allow_null=True))
    def get_form(self, item: OrderItem) -> str | None:
        source = item.source_line
        return source.form if source else None


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
        return can_cancel_order(order)

    @extend_schema_field(OrderTimelineEntrySerializer(many=True))
    def get_timeline(self, order: Order) -> list[dict[str, Any]]:
        rows = [row for row in order.history.all() if row.shop_assignment_id is None]
        return list(OrderTimelineEntrySerializer(rows, many=True).data)


class AdminOrderSummarySerializer(serializers.ModelSerializer):
    patient_name = serializers.CharField(source="patient.full_name", read_only=True)
    area = serializers.SerializerMethodField()
    unassigned_count = serializers.IntegerField(read_only=True)
    awaiting_payment_minutes = serializers.SerializerMethodField()

    class Meta:
        model = Order
        fields = [
            "id",
            "code",
            "placed_at",
            "patient_name",
            "area",
            "total_poisha",
            "status",
            "unassigned_count",
            "awaiting_payment_minutes",
        ]

    def get_area(self, order: Order) -> str:
        return (
            f"{localized_text(order.location, 'upazila')}, "
            f"{localized_text(order.location, 'district')}"
        )

    def get_awaiting_payment_minutes(self, order: Order) -> int | None:
        if order.status != Order.Status.PENDING_PAYMENT:
            return None
        delta = timezone.now() - order.placed_at
        return max(0, int(delta.total_seconds() // 60))


class AdminOrderPatientSerializer(serializers.Serializer):
    id = serializers.UUIDField(read_only=True)
    full_name = serializers.CharField(read_only=True)
    phone = serializers.CharField(read_only=True)


class AdminOrderItemSerializer(PatientOrderItemSerializer):
    shop_assignment_id = serializers.UUIDField(read_only=True, allow_null=True)
    shop_name = serializers.SerializerMethodField()
    shop_unit_price_poisha = serializers.IntegerField(read_only=True, allow_null=True)
    pack_label = serializers.SerializerMethodField()

    class Meta(PatientOrderItemSerializer.Meta):
        fields = [
            *PatientOrderItemSerializer.Meta.fields,
            "shop_assignment_id",
            "shop_name",
            "shop_unit_price_poisha",
            "pack_label",
        ]

    def get_shop_name(self, item: OrderItem) -> str | None:
        if item.shop_assignment:
            return item.shop_assignment.shop.name
        return None

    def get_pack_label(self, item: OrderItem) -> str | None:
        if item.shop_remedy:
            return f"{item.shop_remedy.pack_size} {item.shop_remedy.unit}"
        return None


class AdminAssignmentLineSerializer(serializers.ModelSerializer):
    potency = serializers.SerializerMethodField()
    form = serializers.SerializerMethodField()

    class Meta:
        model = OrderItem
        fields = ["id", "remedy_name", "potency", "form", "quantity", "shop_unit_price_poisha"]

    @extend_schema_field(serializers.ChoiceField(choices=Potency.choices, allow_null=True))
    def get_potency(self, item: OrderItem) -> str | None:
        source = item.source_line
        return source.potency if source else None

    @extend_schema_field(serializers.ChoiceField(choices=RemedyForm.choices, allow_null=True))
    def get_form(self, item: OrderItem) -> str | None:
        source = item.source_line
        return source.form if source else None


class AdminShopAssignmentSerializer(serializers.ModelSerializer):
    shop_id = serializers.UUIDField(source="shop.id", read_only=True)
    shop_name = serializers.CharField(source="shop.name", read_only=True)
    expected_cod_poisha = serializers.SerializerMethodField()
    next_statuses = serializers.SerializerMethodField()
    items = AdminAssignmentLineSerializer(many=True, read_only=True)

    class Meta:
        model = ShopAssignment
        fields = [
            "id",
            "shop_id",
            "shop_name",
            "status",
            "shop_total_poisha",
            "expected_cod_poisha",
            "cod_collected_poisha",
            "next_statuses",
            "items",
        ]

    def get_expected_cod_poisha(self, assignment: ShopAssignment) -> int:
        return expected_cod(assignment)

    @extend_schema_field(
        serializers.ListField(child=serializers.ChoiceField(choices=ShopAssignment.Status.choices))
    )
    def get_next_statuses(self, assignment: ShopAssignment) -> list[str]:
        return next_statuses_for(assignment)


class AdminOrderHistorySerializer(serializers.ModelSerializer):
    changed_by_name = serializers.SerializerMethodField()
    shop_name = serializers.SerializerMethodField()

    class Meta:
        model = OrderStatusHistory
        fields = [
            "id",
            "from_status",
            "to_status",
            "changed_by_name",
            "by_patient",
            "shop_name",
            "note",
            "created_at",
        ]

    def get_changed_by_name(self, entry: OrderStatusHistory) -> str | None:
        if entry.changed_by:
            return entry.changed_by.first_name or entry.changed_by.username
        return None

    def get_shop_name(self, entry: OrderStatusHistory) -> str | None:
        if entry.shop_assignment:
            return entry.shop_assignment.shop.name
        return None


class AdminOrderPaymentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Payment
        fields = [
            "id",
            "tran_id",
            "method",
            "gateway",
            "amount_poisha",
            "status",
            "shop_assignment_id",
            "created_at",
        ]


class AdminOrderDetailSerializer(serializers.ModelSerializer):
    patient = AdminOrderPatientSerializer(read_only=True)
    shipping_address = ShippingAddressSerializer(read_only=True)
    items = AdminOrderItemSerializer(many=True, read_only=True)
    assignments = AdminShopAssignmentSerializer(many=True, read_only=True)
    history = serializers.SerializerMethodField()
    payments = AdminOrderPaymentSerializer(many=True, read_only=True)
    can_cancel = serializers.SerializerMethodField()

    class Meta:
        model = Order
        fields = [
            "id",
            "code",
            "placed_at",
            "cancelled_at",
            "status",
            "payment_method",
            "patient",
            "shipping_address",
            "subtotal_poisha",
            "delivery_charge_poisha",
            "total_poisha",
            "can_cancel",
            "items",
            "assignments",
            "history",
            "payments",
        ]

    def get_can_cancel(self, order: Order) -> bool:
        return can_cancel_order(order)

    @extend_schema_field(AdminOrderHistorySerializer(many=True))
    def get_history(self, order: Order) -> list[dict[str, Any]]:
        rows = sorted(order.history.all(), key=lambda row: row.created_at, reverse=True)
        return list(AdminOrderHistorySerializer(rows, many=True).data)


class AdminCandidateListingSerializer(serializers.Serializer):
    shop_remedy_id = serializers.UUIDField(source="shop_remedy.id", read_only=True)
    shop_id = serializers.UUIDField(source="shop_remedy.shop.id", read_only=True)
    shop_name = serializers.CharField(source="shop_remedy.shop.name", read_only=True)
    area_name = serializers.SerializerMethodField()
    area_match = serializers.ChoiceField(
        choices=[
            ("UPAZILA", "UPAZILA"),
            ("DISTRICT", "DISTRICT"),
            ("DIVISION", "DIVISION"),
            ("OTHER", "OTHER"),
        ],
        read_only=True,
    )
    pack_size = serializers.IntegerField(source="shop_remedy.pack_size", read_only=True)
    unit = serializers.ChoiceField(
        source="shop_remedy.unit", choices=ShopRemedy.Unit.choices, read_only=True
    )
    price_poisha = serializers.IntegerField(source="shop_remedy.price_poisha", read_only=True)
    free_stock = serializers.IntegerField(read_only=True)

    def get_area_name(self, candidate: CandidateListing) -> str:
        loc = candidate.shop_remedy.shop.location
        return f"{localized_text(loc, 'upazila')}, {localized_text(loc, 'district')}"


class AdminAssignLineSerializer(serializers.Serializer):
    shop_remedy_id = serializers.PrimaryKeyRelatedField(
        source="shop_remedy", queryset=ShopRemedy.objects.all()
    )


class AdminAssignmentStatusSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=ShopAssignment.Status.choices)
    cash_collected_poisha = serializers.IntegerField(min_value=0, required=False, allow_null=True)
    note = serializers.CharField(max_length=500, required=False, allow_blank=True, default="")


class AdminCancelOrderSerializer(serializers.Serializer):
    reason = serializers.CharField(max_length=500, allow_blank=False)
