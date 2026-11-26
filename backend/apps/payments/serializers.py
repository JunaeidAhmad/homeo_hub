from typing import Any

from rest_framework import serializers

from apps.billing.models import ConsultationInvoice
from apps.orders.models import Order

from .models import Payment


class PaymentStartRequestSerializer(serializers.Serializer):
    order_id = serializers.PrimaryKeyRelatedField(
        queryset=Order.objects.all(),
        source="order",
        required=False,
        allow_null=True,
        default=None,
    )
    invoice_id = serializers.PrimaryKeyRelatedField(
        queryset=ConsultationInvoice.objects.all(),
        source="invoice",
        required=False,
        allow_null=True,
        default=None,
    )

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        order = attrs.get("order")
        invoice = attrs.get("invoice")
        if (order is None) == (invoice is None):
            raise serializers.ValidationError("Provide either order_id or invoice_id.")
        return attrs


class PaymentStartResponseSerializer(serializers.Serializer):
    tran_id = serializers.CharField(read_only=True)
    gateway_url = serializers.CharField(read_only=True)


class PatientPaymentStatusSerializer(serializers.ModelSerializer):
    order_id = serializers.UUIDField(read_only=True, allow_null=True)
    order_code = serializers.SerializerMethodField()
    invoice_id = serializers.UUIDField(read_only=True, allow_null=True)
    consultation_id = serializers.SerializerMethodField()

    class Meta:
        model = Payment
        fields = [
            "tran_id",
            "status",
            "amount_poisha",
            "order_id",
            "order_code",
            "invoice_id",
            "consultation_id",
        ]

    def get_order_code(self, payment: Payment) -> str | None:
        return payment.order.code if payment.order else None

    def get_consultation_id(self, payment: Payment) -> str | None:
        return str(payment.invoice.consultation_id) if payment.invoice else None


class AdminPaymentSerializer(serializers.ModelSerializer):
    order_code = serializers.SerializerMethodField()
    invoice_id = serializers.UUIDField(read_only=True, allow_null=True)
    consultation_code = serializers.SerializerMethodField()
    patient_name = serializers.CharField(source="patient.full_name", read_only=True)

    class Meta:
        model = Payment
        fields = [
            "id",
            "tran_id",
            "order_id",
            "order_code",
            "invoice_id",
            "consultation_code",
            "patient_name",
            "method",
            "gateway",
            "amount_poisha",
            "status",
            "is_flagged",
            "flag_reason",
            "created_at",
        ]

    def get_order_code(self, payment: Payment) -> str | None:
        return payment.order.code if payment.order else None

    def get_consultation_code(self, payment: Payment) -> str | None:
        if payment.invoice:
            return payment.invoice.consultation.consultation_code
        return None
