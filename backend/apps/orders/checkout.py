"""Order checkout, quote, and patient cancellation."""

import secrets

from django.db import IntegrityError, transaction
from django.utils import timezone

from apps.locations.models import Location
from apps.patients.models import Patient
from common.errors import ApiError
from common.phone import InvalidPhone, normalize_phone
from common.search import normalize_text

from .cart import get_active_cart, price_cart
from .delivery import delivery_charge_for
from .models import Cart, Order, OrderItem, OrderStatusHistory

_BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"
CANCELLABLE_STATUSES = {Order.Status.CONFIRMED, Order.Status.PENDING_PAYMENT}


class CartEmpty(ApiError):
    status_code = 409
    error_code = "CART_EMPTY"
    default_detail = "Your cart is empty."


class CartHasUnavailable(ApiError):
    status_code = 409
    error_code = "CART_HAS_UNAVAILABLE"
    default_detail = "Some items in your cart are no longer available."


class PaymentMethodUnsupported(ApiError):
    status_code = 400
    error_code = "PAYMENT_METHOD_UNSUPPORTED"
    default_detail = "Only cash on delivery is supported right now."


class OrderNotCancellable(ApiError):
    status_code = 409
    error_code = "ORDER_NOT_CANCELLABLE"
    default_detail = "This order can no longer be cancelled."


class InvalidRecipientPhone(ApiError):
    status_code = 400
    error_code = "INVALID_PHONE"
    default_detail = "Enter a Bangladeshi mobile number."


def _generate_order_code() -> str:
    today = timezone.localdate().strftime("%y%m%d")
    suffix = "".join(secrets.choice(_BASE32) for _ in range(4))
    return f"HH-ORD-{today}-{suffix}"


def quote_order(patient: Patient, location: Location) -> dict[str, int]:
    cart = get_active_cart(patient)
    priced = price_cart(cart)
    delivery = delivery_charge_for(location)
    return {
        "subtotal_poisha": priced.subtotal_poisha,
        "delivery_charge_poisha": delivery,
        "total_poisha": priced.subtotal_poisha + delivery,
    }


@transaction.atomic
def checkout(
    patient: Patient,
    location: Location,
    address_line: str,
    recipient_name: str,
    phone: str,
    payment_method: str,
    idempotency_key: str | None = None,
) -> tuple[Order, bool]:
    if payment_method != Order.PaymentMethod.COD:
        raise PaymentMethodUnsupported()

    try:
        clean_phone = normalize_phone(phone)
    except InvalidPhone as error:
        raise InvalidRecipientPhone() from error

    key = (idempotency_key or "").strip() or None
    if key:
        existing = Order.objects.filter(patient=patient, idempotency_key=key).first()
        if existing is not None:
            return existing, False

    cart = (
        Cart.objects.select_for_update().filter(patient=patient, status=Cart.Status.ACTIVE).first()
    )
    if cart is None:
        raise CartEmpty()

    priced = price_cart(cart)
    if not priced.items:
        raise CartEmpty()
    if any(not item.available for item in priced.items):
        raise CartHasUnavailable()

    delivery = delivery_charge_for(location)
    total = priced.subtotal_poisha + delivery
    shipping_address = {
        "recipient_name": normalize_text(recipient_name).strip(),
        "phone": clean_phone,
        "address_line": normalize_text(address_line).strip(),
        "area_en": f"{location.upazila_en}, {location.district_en}",
        "area_bn": f"{location.upazila_bn}, {location.district_bn}",
    }

    order: Order | None = None
    for _ in range(5):
        try:
            with transaction.atomic():
                order = Order.objects.create(
                    code=_generate_order_code(),
                    patient=patient,
                    location=location,
                    shipping_address=shipping_address,
                    payment_method=payment_method,
                    status=Order.Status.CONFIRMED,
                    subtotal_poisha=priced.subtotal_poisha,
                    delivery_charge_poisha=delivery,
                    total_poisha=total,
                    idempotency_key=key,
                )
            break
        except IntegrityError:
            if key:
                existing = Order.objects.filter(patient=patient, idempotency_key=key).first()
                if existing is not None:
                    return existing, False
            order = None
    if order is None:
        raise RuntimeError("Could not allocate unique order code.")

    OrderItem.objects.bulk_create(
        [
            OrderItem(
                order=order,
                self_prescription_item=line.item.self_prescription_item,
                remedy_name=line.remedy.name,
                unit_price_poisha=line.unit_price_poisha,
                quantity=line.item.quantity,
                line_total_poisha=line.line_total_poisha,
            )
            for line in priced.items
        ]
    )

    OrderStatusHistory.objects.create(
        order=order,
        from_status="",
        to_status=Order.Status.CONFIRMED,
        by_patient=True,
    )

    cart.status = Cart.Status.CHECKED_OUT
    cart.save(update_fields=["status", "updated_at"])
    return order, True


def cancel_by_patient(order: Order) -> Order:
    from .fulfilment import cancel_order

    return cancel_order(order, actor=None, by_patient=True)
