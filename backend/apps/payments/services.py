"""Payment initiation, IPN validation, redirect logging, and manual reconciliation."""

import secrets
from datetime import timedelta
from typing import Any

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from apps.orders.models import Order, OrderStatusHistory
from apps.patients.models import Patient
from common.errors import ApiError

from .gateways import get_gateway
from .gateways.base import GatewayUrls, Validation
from .models import Payment, PaymentEvent

FINAL_PAYMENT_STATUSES = {
    Payment.Status.SUCCESS,
    Payment.Status.FAILED,
    Payment.Status.CANCELLED,
    Payment.Status.EXPIRED,
    Payment.Status.REFUNDED,
}
VALID_GATEWAY_STATUSES = {"VALID", "VALIDATED", "SUCCESS"}


class OrderNotPayable(ApiError):
    status_code = 409
    error_code = "ORDER_NOT_PAYABLE"
    default_detail = "This order is not awaiting online payment."


class InvalidGatewayPayload(ApiError):
    status_code = 400
    error_code = "INVALID_GATEWAY_PAYLOAD"
    default_detail = "The payment notification could not be read."


def _new_tran_id() -> str:
    return f"HH-PAY-{secrets.token_hex(6).upper()}"


def _urls_for(tran_id: str) -> GatewayUrls:
    base = settings.WEB_APP_URL.rstrip("/")
    result = f"{base}/payments/result?tran_id={tran_id}"
    return GatewayUrls(
        ipn_url=f"{base}/api/v1/payments/ipn/",
        success_url=result,
        fail_url=result,
        cancel_url=result,
    )


@transaction.atomic
def start_payment(patient: Patient, order: Order) -> tuple[Payment, str]:
    locked_order = Order.objects.select_for_update().get(pk=order.pk)
    if (
        locked_order.patient_id != patient.id
        or locked_order.payment_method != Order.PaymentMethod.ONLINE
        or locked_order.status != Order.Status.PENDING_PAYMENT
    ):
        raise OrderNotPayable()

    gateway = get_gateway()
    payment = Payment.objects.create(
        tran_id=_new_tran_id(),
        patient=patient,
        order=locked_order,
        method=Payment.Method.ONLINE,
        gateway=getattr(gateway, "name", "gateway"),
        amount_poisha=locked_order.total_poisha,
        currency="BDT",
        status=Payment.Status.INITIATED,
    )

    result = gateway.initiate(payment, _urls_for(payment.tran_id))
    payment.session_key = result.session_key
    payment.status = Payment.Status.PENDING
    payment.save(update_fields=["session_key", "status", "updated_at"])

    PaymentEvent.objects.create(
        payment=payment,
        kind=PaymentEvent.Kind.INITIATE,
        payload=result.raw,
    )
    return payment, result.gateway_url


def _apply_validation(
    payment: Payment,
    validation: Validation,
    val_id: str,
    event_kind: str,
) -> Payment:
    PaymentEvent.objects.create(
        payment=payment,
        kind=event_kind,
        payload=validation.raw,
    )

    if validation.status == "CANCELLED":
        payment.status = Payment.Status.CANCELLED
        payment.save(update_fields=["status", "updated_at"])
        return payment

    if validation.status not in VALID_GATEWAY_STATUSES:
        payment.status = Payment.Status.FAILED
        payment.save(update_fields=["status", "updated_at"])
        return payment

    if (
        validation.tran_id != payment.tran_id
        or validation.amount_poisha != payment.amount_poisha
        or validation.currency != payment.currency
    ):
        payment.is_flagged = True
        payment.flag_reason = "Amount or currency mismatch"
        payment.save(update_fields=["is_flagged", "flag_reason", "updated_at"])
        return payment

    now = timezone.now()
    payment.status = Payment.Status.SUCCESS
    payment.val_id = val_id or payment.val_id
    payment.validated_at = now

    if payment.order_id is not None:
        locked_order = Order.objects.select_for_update().get(pk=payment.order_id)
        if locked_order.status == Order.Status.CANCELLED:
            payment.is_flagged = True
            payment.flag_reason = "Paid after the order was cancelled"
        elif locked_order.status == Order.Status.PENDING_PAYMENT:
            locked_order.status = Order.Status.PAID
            locked_order.save(update_fields=["status", "updated_at"])
            OrderStatusHistory.objects.create(
                order=locked_order,
                from_status=Order.Status.PENDING_PAYMENT,
                to_status=Order.Status.PAID,
                by_patient=False,
                note=f"Payment {payment.tran_id}",
            )

    payment.save(
        update_fields=[
            "status",
            "val_id",
            "validated_at",
            "is_flagged",
            "flag_reason",
            "updated_at",
        ]
    )
    return payment


@transaction.atomic
def handle_ipn(data: dict[str, Any]) -> Payment | None:
    gateway = get_gateway()
    try:
        ipn = gateway.parse_ipn(data)
    except ValueError as error:
        raise InvalidGatewayPayload() from error

    payment = Payment.objects.select_for_update().filter(tran_id=ipn.tran_id).first()
    if payment is None:
        return None

    PaymentEvent.objects.create(
        payment=payment,
        kind=PaymentEvent.Kind.IPN,
        payload=ipn.raw,
    )

    if payment.status in FINAL_PAYMENT_STATUSES:
        return payment

    if ipn.status == "CANCELLED":
        payment.status = Payment.Status.CANCELLED
        payment.save(update_fields=["status", "updated_at"])
        return payment

    if ipn.status in {"FAILED", "FAIL"}:
        payment.status = Payment.Status.FAILED
        payment.save(update_fields=["status", "updated_at"])
        return payment

    validation = gateway.validate(ipn.val_id)
    return _apply_validation(payment, validation, ipn.val_id, PaymentEvent.Kind.VALIDATE)


@transaction.atomic
def handle_redirect(data: dict[str, Any]) -> Payment | None:
    gateway = get_gateway()
    try:
        redirect = gateway.parse_redirect(data)
    except ValueError as error:
        raise InvalidGatewayPayload() from error

    payment = Payment.objects.select_for_update().filter(tran_id=redirect.tran_id).first()
    if payment is None:
        return None

    PaymentEvent.objects.create(
        payment=payment,
        kind=PaymentEvent.Kind.REDIRECT,
        payload=redirect.raw,
    )
    return payment


def reconcile_payments() -> dict[str, int]:
    """Query pending payments older than 30 min; expire after 60 min without a gateway result."""
    now = timezone.now()
    stale_after = now - timedelta(minutes=30)
    expire_after = now - timedelta(minutes=60)
    gateway = get_gateway()

    candidates = list(
        Payment.objects.filter(
            status=Payment.Status.PENDING,
            created_at__lte=stale_after,
        ).values_list("id", flat=True)
    )

    counts = {"checked": 0, "resolved": 0, "expired": 0}
    for payment_id in candidates:
        with transaction.atomic():
            payment = Payment.objects.select_for_update().get(pk=payment_id)
            if payment.status != Payment.Status.PENDING:
                continue
            counts["checked"] += 1
            result = gateway.query(payment.tran_id)
            if result is not None:
                _apply_validation(
                    payment,
                    result,
                    str(result.raw.get("val_id", "")),
                    PaymentEvent.Kind.RECONCILE,
                )
                counts["resolved"] += 1
            elif payment.created_at <= expire_after:
                payment.status = Payment.Status.EXPIRED
                payment.save(update_fields=["status", "updated_at"])
                PaymentEvent.objects.create(
                    payment=payment,
                    kind=PaymentEvent.Kind.RECONCILE,
                    payload={"expired": True},
                )
                counts["expired"] += 1
    return counts
