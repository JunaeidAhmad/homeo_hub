from rest_framework import serializers

from apps.orders.models import Order

from .models import Payment


class PaymentStartRequestSerializer(serializers.Serializer):
    order_id = serializers.PrimaryKeyRelatedField(queryset=Order.objects.all(), source="order")


class PaymentStartResponseSerializer(serializers.Serializer):
    tran_id = serializers.CharField(read_only=True)
    gateway_url = serializers.CharField(read_only=True)


class PatientPaymentStatusSerializer(serializers.ModelSerializer):
    order_id = serializers.UUIDField(read_only=True, allow_null=True)
    order_code = serializers.SerializerMethodField()

    class Meta:
        model = Payment
        fields = ["tran_id", "status", "amount_poisha", "order_id", "order_code"]

    def get_order_code(self, payment: Payment) -> str | None:
        return payment.order.code if payment.order else None


class AdminPaymentSerializer(serializers.ModelSerializer):
    order_code = serializers.SerializerMethodField()
    patient_name = serializers.CharField(source="patient.full_name", read_only=True)

    class Meta:
        model = Payment
        fields = [
            "id",
            "tran_id",
            "order_id",
            "order_code",
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
