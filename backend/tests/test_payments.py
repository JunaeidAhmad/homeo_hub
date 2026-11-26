"""Online payments: the public IPN can't be trusted on its own, and late or repeated payments
are recorded and flagged, never lost."""

import pytest
from django.test import Client
from rest_framework.test import APIClient

from apps.locations.models import Location
from apps.orders.models import Order
from apps.payments.models import Payment
from apps.remedies.choices import Potency, RemedyForm
from tests.auth_helpers import verified_patient
from tests.test_fulfilment import make_remedy

pytestmark = pytest.mark.django_db

IPN = "/api/v1/payments/ipn/"


def online_order(location: Location) -> tuple[APIClient, dict]:
    client = APIClient()
    session = verified_patient(client, location, phone="01712345678")
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {session['access_token']}")
    remedy = make_remedy("Arnica")
    added = client.post(
        "/api/v1/cart/items/",
        {"remedy_id": str(remedy.id), "potency": Potency.P30C, "form": RemedyForm.PILL},
        format="json",
    )
    assert added.status_code == 200, added.content
    order = client.post(
        "/api/v1/orders/",
        {
            "location_id": str(location.id),
            "recipient_name": "Rahima",
            "phone": "01712345678",
            "address_line": "Road 10",
            "payment_method": "ONLINE",
        },
        format="json",
    )
    assert order.status_code == 201, order.content
    return client, order.json()


def start(client: APIClient, order: dict) -> dict:
    response = client.post("/api/v1/payments/", {"order_id": order["id"]}, format="json")
    assert response.status_code == 201, response.content
    return response.json()


def pay_at_mock_gateway(started: dict, action: str = "SUCCESS") -> None:
    response = Client().post(started["gateway_url"], {"action": action})
    assert response.status_code == 302


def test_a_forged_ipn_cannot_fail_or_cancel_a_pending_payment(location):
    client, order = online_order(location)
    started = start(client, order)

    for body in (
        {"tran_id": started["tran_id"], "status": "FAILED"},
        {"tran_id": started["tran_id"], "status": "CANCELLED"},
        # A blank val_id must not match the unpaid gateway session either.
        {"tran_id": started["tran_id"], "status": "VALID", "val_id": ""},
    ):
        assert APIClient().post(IPN, body, format="json").status_code == 200

    payment = Payment.objects.get(tran_id=started["tran_id"])
    assert payment.status == Payment.Status.PENDING

    # The real outcome, confirmed by the gateway, still goes through.
    pay_at_mock_gateway(started)
    payment.refresh_from_db()
    assert payment.status == Payment.Status.SUCCESS
    assert Order.objects.get(pk=order["id"]).status == Order.Status.PAID


def test_money_paid_after_the_order_was_cancelled_is_recorded_and_flagged(location):
    client, order = online_order(location)
    started = start(client, order)
    cancelled = client.post(f"/api/v1/orders/{order['id']}/cancel/", {}, format="json")
    assert cancelled.status_code == 200

    pay_at_mock_gateway(started)

    payment = Payment.objects.get(tran_id=started["tran_id"])
    assert payment.status == Payment.Status.SUCCESS
    assert payment.is_flagged
    assert payment.flag_reason == "Paid after the order was cancelled"
    assert Order.objects.get(pk=order["id"]).status == Order.Status.CANCELLED


def test_a_second_successful_payment_for_the_same_order_is_flagged(location):
    client, order = online_order(location)
    first = start(client, order)
    second = start(client, order)

    pay_at_mock_gateway(first)
    pay_at_mock_gateway(second)

    assert not Payment.objects.get(tran_id=first["tran_id"]).is_flagged
    repeat = Payment.objects.get(tran_id=second["tran_id"])
    assert repeat.status == Payment.Status.SUCCESS
    assert repeat.is_flagged
    assert repeat.flag_reason == "Order was already paid"
