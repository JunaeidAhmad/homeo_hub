"""Cart read and write services. Totals are always computed on the server."""

from dataclasses import dataclass
from uuid import UUID

from django.db import IntegrityError, transaction

from apps.billing.selectors import is_unlocked
from apps.consultations.models import DoctorConsultation
from apps.illnesses.models import Illness
from apps.illnesses.selectors import public_illnesses
from apps.patients.models import Patient
from apps.prescriptions.selectors import active_prescription
from apps.remedies.models import Remedy
from apps.remedies.selectors import patient_price, public_remedies
from apps.selfcare.models import SelfPrescription, SelfPrescriptionItem
from common.errors import ApiError

from .models import Cart, CartItem

MAX_QUANTITY = 10


class RemedyUnavailable(ApiError):
    status_code = 409
    error_code = "REMEDY_UNAVAILABLE"
    default_detail = "This remedy or form is currently unavailable."


class PrescriptionLocked(ApiError):
    status_code = 403
    error_code = "PRESCRIPTION_LOCKED"
    default_detail = "Pay the consultation fee to unlock this prescription first."


class QuantityOutOfRange(ApiError):
    status_code = 400
    error_code = "QUANTITY_OUT_OF_RANGE"
    default_detail = f"Quantity must be between 1 and {MAX_QUANTITY}."


class IllnessNotFound(ApiError):
    status_code = 404
    error_code = "ILLNESS_NOT_FOUND"
    default_detail = "That illness could not be found."


def _lock_or_create_active_cart(patient: Patient) -> Cart:
    try:
        return Cart.objects.select_for_update().get(patient=patient, status=Cart.Status.ACTIVE)
    except Cart.DoesNotExist:
        try:
            with transaction.atomic():
                cart = Cart.objects.create(patient=patient, status=Cart.Status.ACTIVE)
            return Cart.objects.select_for_update().get(pk=cart.pk)
        except IntegrityError:
            return Cart.objects.select_for_update().get(patient=patient, status=Cart.Status.ACTIVE)


def get_active_cart(patient: Patient) -> Cart:
    cart = Cart.objects.filter(patient=patient, status=Cart.Status.ACTIVE).first()
    if cart is not None:
        return cart
    with transaction.atomic():
        return _lock_or_create_active_cart(patient)


@transaction.atomic
def add_self_care_item(
    patient: Patient,
    remedy_id: UUID,
    illness_id: UUID | None,
    potency: str,
    form: str,
    quantity: int = 1,
) -> Cart:
    if not 1 <= quantity <= MAX_QUANTITY:
        raise QuantityOutOfRange()

    remedy = public_remedies().filter(pk=remedy_id).first()
    if remedy is None or patient_price(remedy, form) is None:
        raise RemedyUnavailable()

    illness: Illness | None = None
    if illness_id is not None:
        illness = public_illnesses().filter(pk=illness_id).first()
        if illness is None:
            raise IllnessNotFound()

    cart = _lock_or_create_active_cart(patient)

    existing = (
        CartItem.objects.select_for_update(of=("self",))
        .filter(
            cart=cart,
            self_prescription_item__self_prescription__illness=illness,
            self_prescription_item__remedy=remedy,
            self_prescription_item__potency=potency,
            self_prescription_item__form=form,
        )
        .first()
    )
    if existing is not None:
        existing.quantity = min(MAX_QUANTITY, existing.quantity + quantity)
        existing.save(update_fields=["quantity"])
    else:
        existing_rx = (
            CartItem.objects.filter(
                cart=cart,
                self_prescription_item__self_prescription__patient=patient,
                self_prescription_item__self_prescription__illness=illness,
            )
            .select_related("self_prescription_item__self_prescription")
            .first()
        )
        if existing_rx and existing_rx.self_prescription_item:
            rx = existing_rx.self_prescription_item.self_prescription
        else:
            rx = SelfPrescription.objects.create(
                patient=patient,
                illness=illness,
                location=patient.location,
            )
        rx_item = SelfPrescriptionItem.objects.create(
            self_prescription=rx,
            remedy=remedy,
            potency=potency,
            form=form,
        )
        CartItem.objects.create(
            cart=cart,
            self_prescription_item=rx_item,
            quantity=quantity,
        )

    cart.save(update_fields=["updated_at"])
    return cart


@transaction.atomic
def set_quantity(item: CartItem, quantity: int) -> Cart:
    if not 1 <= quantity <= MAX_QUANTITY:
        raise QuantityOutOfRange()
    locked_cart = Cart.objects.select_for_update().get(pk=item.cart_id)
    locked_item = CartItem.objects.select_for_update().get(pk=item.pk)
    locked_item.quantity = quantity
    locked_item.save(update_fields=["quantity"])
    locked_cart.save(update_fields=["updated_at"])
    return locked_cart


@transaction.atomic
def remove_item(item: CartItem) -> Cart:
    locked_cart = Cart.objects.select_for_update().get(pk=item.cart_id)
    item.delete()
    locked_cart.save(update_fields=["updated_at"])
    return locked_cart


@transaction.atomic
def add_prescription_to_cart(
    patient: Patient,
    consultation: DoctorConsultation,
) -> tuple[Cart, int, list[dict[str, str]]]:
    """Add every buyable line of the unlocked active prescription to the patient's cart."""
    if not is_unlocked(consultation):
        raise PrescriptionLocked()

    rx = active_prescription(consultation)
    if rx is None:
        raise IllnessNotFound()  # unreachable when view checks active prescription

    cart = _lock_or_create_active_cart(patient)
    added_count = 0
    skipped: list[dict[str, str]] = []

    for rx_item in rx.items.all():
        if rx_item.remedy is None:
            skipped.append(
                {
                    "item_id": str(rx_item.pk),
                    "remedy_name": rx_item.remedy_name,
                    "reason": "NOT_LISTED",
                }
            )
            continue
        if patient_price(rx_item.remedy, rx_item.form) is None:
            skipped.append(
                {
                    "item_id": str(rx_item.pk),
                    "remedy_name": rx_item.remedy_name,
                    "reason": "NO_PRICE",
                }
            )
            continue

        existing = (
            CartItem.objects.select_for_update()
            .filter(cart=cart, prescription_item=rx_item)
            .first()
        )
        if existing is not None:
            existing.quantity = min(MAX_QUANTITY, existing.quantity + 1)
            existing.save(update_fields=["quantity"])
        else:
            CartItem.objects.create(
                cart=cart,
                prescription_item=rx_item,
                quantity=1,
            )
        added_count += 1

    if added_count > 0:
        cart.save(update_fields=["updated_at"])
    return cart, added_count, skipped


@dataclass(frozen=True)
class PricedCartItem:
    item: CartItem
    remedy: Remedy
    illness: Illness | None
    prescribed_by_name: str | None
    potency: str
    form: str
    unit_price_poisha: int
    line_total_poisha: int
    available: bool


@dataclass(frozen=True)
class PricedCart:
    cart: Cart
    items: list[PricedCartItem]
    item_count: int
    subtotal_poisha: int
    max_quantity: int = MAX_QUANTITY


def price_cart(cart: Cart) -> PricedCart:
    rows = (
        CartItem.objects.filter(cart=cart)
        .select_related(
            "self_prescription_item__remedy",
            "self_prescription_item__self_prescription__illness",
            "prescription_item__remedy",
            "prescription_item__prescription__doctor",
        )
        .order_by("created_at")
    )
    priced: list[PricedCartItem] = []
    item_count = 0
    subtotal = 0

    for row in rows:
        if row.self_prescription_item is not None:
            self_src = row.self_prescription_item
            remedy = self_src.remedy
            illness = self_src.self_prescription.illness
            prescribed_by_name = None
            potency = self_src.potency
            form = self_src.form
        else:
            rx_src = row.prescription_item
            assert rx_src is not None
            assert rx_src.remedy is not None
            remedy = rx_src.remedy
            illness = None
            prescribed_by_name = rx_src.prescription.doctor.full_name
            potency = rx_src.potency
            form = rx_src.form

        unit = patient_price(remedy, form)
        available = unit is not None
        unit_price = unit if unit is not None else 0
        line_total = unit_price * row.quantity if available else 0
        item_count += row.quantity
        if available:
            subtotal += line_total
        priced.append(
            PricedCartItem(
                item=row,
                remedy=remedy,
                illness=illness,
                prescribed_by_name=prescribed_by_name,
                potency=potency,
                form=form,
                unit_price_poisha=unit_price,
                line_total_poisha=line_total,
                available=available,
            )
        )

    return PricedCart(
        cart=cart,
        items=priced,
        item_count=item_count,
        subtotal_poisha=subtotal,
    )
