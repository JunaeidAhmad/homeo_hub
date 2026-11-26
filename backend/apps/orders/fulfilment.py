"""Fulfilment: assigning shop listings to order lines, advancing shipments, and COD payments."""

from dataclasses import dataclass

from django.contrib.auth.models import User
from django.db import transaction
from django.utils import timezone

from apps.payments.models import Payment
from apps.shops.models import ShopRemedy
from common.errors import ApiError

from .models import Order, OrderItem, OrderStatusHistory, ShopAssignment

ASSIGNABLE_ORDER_STATUSES = {
    Order.Status.CONFIRMED,
    Order.Status.PAID,
    Order.Status.PROCESSING,
}
LOCKED_ASSIGNMENT_STATUSES = {
    ShopAssignment.Status.PROCESSING,
    ShopAssignment.Status.SHIPPED,
    ShopAssignment.Status.DELIVERED,
    ShopAssignment.Status.RETURNED,
}
ALLOWED_TRANSITIONS: dict[str, tuple[str, ...]] = {
    ShopAssignment.Status.ASSIGNED: (ShopAssignment.Status.PROCESSING,),
    ShopAssignment.Status.PROCESSING: (ShopAssignment.Status.SHIPPED,),
    ShopAssignment.Status.SHIPPED: (
        ShopAssignment.Status.DELIVERED,
        ShopAssignment.Status.RETURNED,
    ),
}
AREA_MATCH_ORDER = {"UPAZILA": 0, "DISTRICT": 1, "DIVISION": 2, "OTHER": 3}


class NotEnoughStock(ApiError):
    status_code = 409
    error_code = "NOT_ENOUGH_STOCK"
    default_detail = "That shop listing does not have enough free stock."


class LineLocked(ApiError):
    status_code = 409
    error_code = "LINE_LOCKED"
    default_detail = "This line's shop assignment has already started packing."


class InvalidTransition(ApiError):
    status_code = 409
    error_code = "INVALID_TRANSITION"
    default_detail = "That status change is not allowed from the current state."


class CashAmountRequired(ApiError):
    status_code = 400
    error_code = "CASH_AMOUNT_REQUIRED"
    default_detail = "Enter the cash collected for a cash-on-delivery delivery."


class OrderNotCancellableFulfilment(ApiError):
    status_code = 409
    error_code = "ORDER_NOT_CANCELLABLE"
    default_detail = "This order can no longer be cancelled."


def next_statuses_for(assignment: ShopAssignment) -> list[str]:
    return list(ALLOWED_TRANSITIONS.get(assignment.status, ()))


def can_cancel_order(order: Order) -> bool:
    if order.status not in {Order.Status.PENDING_PAYMENT, Order.Status.CONFIRMED}:
        return False
    return not any(a.status in LOCKED_ASSIGNMENT_STATUSES for a in order.assignments.all())


def expected_cod(assignment: ShopAssignment) -> int:
    order = assignment.order
    if order.payment_method != Order.PaymentMethod.COD:
        return 0
    lines_total = sum(item.line_total_poisha for item in assignment.items.all())
    first = order.assignments.order_by("created_at").first()
    delivery = order.delivery_charge_poisha if first and first.pk == assignment.pk else 0
    return lines_total + delivery


def _recompute_assignment_total(assignment: ShopAssignment) -> None:
    total = sum(
        (item.shop_unit_price_poisha or 0) * item.quantity for item in assignment.items.all()
    )
    assignment.shop_total_poisha = total
    assignment.save(update_fields=["shop_total_poisha"])


def sync_order_status(order: Order, actor: User | None = None) -> Order:
    if order.status in {Order.Status.CANCELLED, Order.Status.RETURNED}:
        return order

    assignments = list(order.assignments.exclude(status=ShopAssignment.Status.CANCELLED))
    items = list(order.items.all())
    all_lines_assigned = bool(items) and all(item.shop_assignment_id is not None for item in items)

    finished_statuses = {ShopAssignment.Status.DELIVERED, ShopAssignment.Status.RETURNED}
    target = order.status

    if (
        assignments
        and all_lines_assigned
        and all(a.status in finished_statuses for a in assignments)
    ):
        if any(a.status == ShopAssignment.Status.DELIVERED for a in assignments):
            target = Order.Status.DELIVERED
        else:
            target = Order.Status.RETURNED
    elif any(
        a.status in {ShopAssignment.Status.SHIPPED, ShopAssignment.Status.DELIVERED}
        for a in assignments
    ):
        target = Order.Status.SHIPPED
    elif any(a.status == ShopAssignment.Status.PROCESSING for a in assignments):
        target = Order.Status.PROCESSING
    else:
        has_paid_online = (
            order.payment_method == Order.PaymentMethod.ONLINE
            and order.payments.filter(status=Payment.Status.SUCCESS).exists()
        )
        target = Order.Status.PAID if has_paid_online else Order.Status.CONFIRMED

    if target != order.status:
        prev = order.status
        order.status = target
        order.save(update_fields=["status", "updated_at"])
        OrderStatusHistory.objects.create(
            order=order,
            shop_assignment=None,
            from_status=prev,
            to_status=target,
            changed_by=actor,
            by_patient=False,
        )
    return order


@transaction.atomic
def assign_line(order: Order, item: OrderItem, shop_remedy: ShopRemedy, staff: User) -> Order:
    locked_order = Order.objects.select_for_update().get(pk=order.pk)
    locked_item = (
        OrderItem.objects.select_for_update(of=("self",))
        .select_related("self_prescription_item")
        .get(pk=item.pk, order=locked_order)
    )
    locked_sr = (
        ShopRemedy.objects.select_for_update(of=("self",))
        .select_related("shop")
        .get(pk=shop_remedy.pk)
    )

    if locked_order.status not in ASSIGNABLE_ORDER_STATUSES:
        raise InvalidTransition()

    source = locked_item.self_prescription_item
    if (
        not locked_sr.is_available
        or not locked_sr.shop.is_active
        or not locked_sr.shop.is_verified
        or source is None
        or locked_sr.remedy_id != source.remedy_id
    ):
        raise NotEnoughStock()

    old_assignment: ShopAssignment | None = None
    if locked_item.shop_assignment_id is not None:
        old_assignment = ShopAssignment.objects.select_for_update().get(
            pk=locked_item.shop_assignment_id
        )
        if old_assignment.status != ShopAssignment.Status.ASSIGNED:
            raise LineLocked()
        if locked_item.shop_remedy_id == locked_sr.pk:
            return locked_order
        if locked_item.shop_remedy_id is not None:
            old_sr = (
                locked_sr
                if locked_item.shop_remedy_id == locked_sr.pk
                else ShopRemedy.objects.select_for_update().get(pk=locked_item.shop_remedy_id)
            )
            old_sr.reserved_qty = max(0, old_sr.reserved_qty - locked_item.quantity)
            old_sr.save(update_fields=["reserved_qty", "updated_at"])

    if locked_sr.stock_qty - locked_sr.reserved_qty < locked_item.quantity:
        raise NotEnoughStock()

    assignment, created = ShopAssignment.objects.get_or_create(
        order=locked_order,
        shop=locked_sr.shop,
        defaults={"assigned_by": staff},
    )
    if not created:
        assignment = ShopAssignment.objects.select_for_update().get(pk=assignment.pk)
        if assignment.status != ShopAssignment.Status.ASSIGNED:
            raise LineLocked()

    locked_item.shop_assignment = assignment
    locked_item.shop_remedy = locked_sr
    locked_item.shop_unit_price_poisha = locked_sr.price_poisha
    locked_item.save(update_fields=["shop_assignment", "shop_remedy", "shop_unit_price_poisha"])

    locked_sr.reserved_qty += locked_item.quantity
    locked_sr.save(update_fields=["reserved_qty", "updated_at"])

    _recompute_assignment_total(assignment)

    if old_assignment is not None and old_assignment.pk != assignment.pk:
        if not old_assignment.items.exists():
            old_assignment.delete()
        else:
            _recompute_assignment_total(old_assignment)

    OrderStatusHistory.objects.create(
        order=locked_order,
        shop_assignment=assignment,
        from_status="",
        to_status=ShopAssignment.Status.ASSIGNED,
        changed_by=staff,
        by_patient=False,
        note=f"Assigned {locked_item.remedy_name}",
    )

    return sync_order_status(locked_order, actor=staff)


@transaction.atomic
def unassign_line(item: OrderItem, staff: User) -> Order:
    locked_item = OrderItem.objects.select_for_update().get(pk=item.pk)
    locked_order = Order.objects.select_for_update().get(pk=locked_item.order_id)
    if locked_item.shop_assignment_id is None:
        return locked_order

    assignment = ShopAssignment.objects.select_for_update().get(pk=locked_item.shop_assignment_id)
    if assignment.status != ShopAssignment.Status.ASSIGNED:
        raise LineLocked()

    if locked_item.shop_remedy_id is not None:
        sr = ShopRemedy.objects.select_for_update().get(pk=locked_item.shop_remedy_id)
        sr.reserved_qty = max(0, sr.reserved_qty - locked_item.quantity)
        sr.save(update_fields=["reserved_qty", "updated_at"])

    locked_item.shop_assignment = None
    locked_item.shop_remedy = None
    locked_item.shop_unit_price_poisha = None
    locked_item.save(update_fields=["shop_assignment", "shop_remedy", "shop_unit_price_poisha"])

    if not assignment.items.exists():
        assignment.delete()
    else:
        _recompute_assignment_total(assignment)

    return sync_order_status(locked_order, actor=staff)


@transaction.atomic
def advance_assignment(
    assignment: ShopAssignment,
    to_status: str,
    staff: User,
    cash_collected_poisha: int | None = None,
    note: str = "",
) -> Order:
    locked = ShopAssignment.objects.select_for_update().get(pk=assignment.pk)
    locked_order = Order.objects.select_for_update().get(pk=locked.order_id)
    prev = locked.status

    if to_status not in ALLOWED_TRANSITIONS.get(prev, ()):
        raise InvalidTransition()

    lines = list(locked.items.all())
    sr_ids = sorted({line.shop_remedy_id for line in lines if line.shop_remedy_id is not None})
    srs = {
        sr.pk: sr
        for sr in ShopRemedy.objects.select_for_update().filter(pk__in=sr_ids).order_by("pk")
    }

    if prev == ShopAssignment.Status.ASSIGNED and to_status == ShopAssignment.Status.PROCESSING:
        for line in lines:
            if line.shop_remedy_id is None:
                continue
            sr = srs[line.shop_remedy_id]
            sr.stock_qty = max(0, sr.stock_qty - line.quantity)
            sr.reserved_qty = max(0, sr.reserved_qty - line.quantity)
            sr.save(update_fields=["stock_qty", "reserved_qty", "updated_at"])

    elif prev == ShopAssignment.Status.SHIPPED and to_status == ShopAssignment.Status.DELIVERED:
        if locked_order.payment_method == Order.PaymentMethod.COD:
            if cash_collected_poisha is None or cash_collected_poisha < 0:
                raise CashAmountRequired()
            locked.cod_collected_poisha = cash_collected_poisha
            seq = Payment.objects.filter(order=locked_order).count() + 1
            Payment.objects.create(
                tran_id=f"COD-{locked_order.code}-{seq}",
                patient=locked_order.patient,
                order=locked_order,
                shop_assignment=locked,
                method=Payment.Method.COD,
                amount_poisha=cash_collected_poisha,
                status=Payment.Status.SUCCESS,
                recorded_by=staff,
            )

    elif prev == ShopAssignment.Status.SHIPPED and to_status == ShopAssignment.Status.RETURNED:
        for line in lines:
            if line.shop_remedy_id is None:
                continue
            sr = srs[line.shop_remedy_id]
            sr.stock_qty += line.quantity
            sr.save(update_fields=["stock_qty", "updated_at"])

    locked.status = to_status
    locked.status_changed_at = timezone.now()
    locked.save(update_fields=["status", "cod_collected_poisha", "status_changed_at"])

    OrderStatusHistory.objects.create(
        order=locked_order,
        shop_assignment=locked,
        from_status=prev,
        to_status=to_status,
        changed_by=staff,
        by_patient=False,
        note=note.strip(),
    )

    return sync_order_status(locked_order, actor=staff)


@transaction.atomic
def cancel_order(
    order: Order, actor: User | None, by_patient: bool = False, reason: str = ""
) -> Order:
    locked = Order.objects.select_for_update().get(pk=order.pk)
    if locked.status not in {Order.Status.PENDING_PAYMENT, Order.Status.CONFIRMED}:
        raise OrderNotCancellableFulfilment()

    assignments = list(locked.assignments.select_for_update().order_by("pk"))
    if any(a.status in LOCKED_ASSIGNMENT_STATUSES for a in assignments):
        raise OrderNotCancellableFulfilment()

    now = timezone.now()
    for assignment in assignments:
        if assignment.status != ShopAssignment.Status.ASSIGNED:
            continue
        lines = list(assignment.items.all())
        sr_ids = sorted({line.shop_remedy_id for line in lines if line.shop_remedy_id is not None})
        srs = {
            sr.pk: sr
            for sr in ShopRemedy.objects.select_for_update().filter(pk__in=sr_ids).order_by("pk")
        }
        for line in lines:
            if line.shop_remedy_id is None:
                continue
            sr = srs[line.shop_remedy_id]
            sr.reserved_qty = max(0, sr.reserved_qty - line.quantity)
            sr.save(update_fields=["reserved_qty", "updated_at"])

        assignment.status = ShopAssignment.Status.CANCELLED
        assignment.status_changed_at = now
        assignment.save(update_fields=["status", "status_changed_at"])
        OrderStatusHistory.objects.create(
            order=locked,
            shop_assignment=assignment,
            from_status=ShopAssignment.Status.ASSIGNED,
            to_status=ShopAssignment.Status.CANCELLED,
            changed_by=actor,
            by_patient=by_patient,
            note=reason.strip(),
        )

    prev = locked.status
    locked.status = Order.Status.CANCELLED
    locked.cancelled_at = now
    locked.save(update_fields=["status", "cancelled_at", "updated_at"])
    Payment.objects.filter(
        order=locked,
        status__in=[Payment.Status.INITIATED, Payment.Status.PENDING],
    ).update(status=Payment.Status.CANCELLED, updated_at=now)
    OrderStatusHistory.objects.create(
        order=locked,
        shop_assignment=None,
        from_status=prev,
        to_status=Order.Status.CANCELLED,
        changed_by=actor,
        by_patient=by_patient,
        note=reason.strip(),
    )
    return locked


@dataclass(frozen=True)
class CandidateListing:
    shop_remedy: ShopRemedy
    free_stock: int
    area_match: str


def candidate_listings(order: Order, item: OrderItem) -> list[CandidateListing]:
    source = item.self_prescription_item
    if source is None:
        return []
    order_loc = order.location
    listings = ShopRemedy.objects.filter(
        remedy_id=source.remedy_id,
        is_available=True,
        shop__is_active=True,
        shop__is_verified=True,
    ).select_related("shop__location")
    candidates: list[CandidateListing] = []
    for sr in listings:
        free = sr.stock_qty - sr.reserved_qty
        if free < item.quantity:
            continue
        loc = sr.shop.location
        if loc.pk == order_loc.pk:
            match = "UPAZILA"
        elif loc.district_en == order_loc.district_en and loc.division_en == order_loc.division_en:
            match = "DISTRICT"
        elif loc.division_en == order_loc.division_en:
            match = "DIVISION"
        else:
            match = "OTHER"
        candidates.append(CandidateListing(shop_remedy=sr, free_stock=free, area_match=match))

    candidates.sort(
        key=lambda c: (AREA_MATCH_ORDER[c.area_match], -c.free_stock, c.shop_remedy.price_poisha)
    )
    return candidates
