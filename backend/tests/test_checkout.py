"""Checkout with COD and patient order tracking."""

from typing import Any

import pytest
from rest_framework.test import APIClient

from apps.orders.models import Order
from apps.patients.models import Patient
from apps.remedies import services as remedies
from apps.remedies.choices import Potency, RemedyForm
from apps.remedies.models import Remedy
from tests.auth_helpers import WEB, error_code, sign_up, verified_patient

pytestmark = pytest.mark.django_db

CART = "/api/v1/cart/"
CART_ITEMS = "/api/v1/cart/items/"
ORDERS = "/api/v1/orders/"
QUOTE = "/api/v1/orders/quote/"


def assert_no_shop_keys(payload: Any) -> None:
    if isinstance(payload, dict):
        for key, value in payload.items():
            assert "shop" not in key.lower(), f"Forbidden shop key leaked: {key}"
            assert_no_shop_keys(value)
    elif isinstance(payload, list):
        for item in payload:
            assert_no_shop_keys(item)


def make_remedy(name: str = "Arnica montana", price_poisha: int = 12000) -> Remedy:
    remedy = remedies.create_remedy(
        name=name,
        status=Remedy.Status.ACTIVE,
        description_en="Trauma and soreness.",
        indication_en="Bruising and muscle ache.",
        advice_do_en="Rest",
        advice_dont_en="Coffee",
    )
    remedies.set_prices(
        remedy, [{"form": RemedyForm.PILL, "price_poisha": price_poisha, "is_active": True}]
    )
    return remedy


def verified_client(location, phone: str = "01712345678") -> APIClient:
    client = APIClient()
    session = verified_patient(client, location, phone=phone)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {session['access_token']}")
    return client


def add_to_cart(client: APIClient, remedy: Remedy, quantity: int = 2) -> None:
    res = client.post(
        CART_ITEMS,
        {
            "remedy_id": str(remedy.id),
            "potency": Potency.P30C,
            "form": RemedyForm.PILL,
            "quantity": quantity,
        },
        format="json",
    )
    assert res.status_code == 200, res.content


def test_checkout_totals_snapshots_empty_cart_and_idempotency(location, settings):
    settings.DELIVERY_CHARGE_POISHA = 6000
    client = verified_client(location)
    remedy = make_remedy(price_poisha=12000)
    add_to_cart(client, remedy, quantity=2)

    quote = client.post(QUOTE, {"location_id": str(location.id)}, format="json")
    assert quote.status_code == 200
    assert quote.json() == {
        "subtotal_poisha": 24000,
        "delivery_charge_poisha": 6000,
        "total_poisha": 30000,
    }

    payload = {
        "location_id": str(location.id),
        "recipient_name": "Rahima Akhter",
        "phone": "01712345678",
        "address_line": "House 12, Road 3",
        "payment_method": "COD",
    }
    created = client.post(ORDERS, payload, format="json", headers={"Idempotency-Key": "key-1"})
    assert created.status_code == 201, created.content
    order = created.json()
    assert order["status"] == "PENDING"
    assert order["subtotal_poisha"] == 24000
    assert order["delivery_charge_poisha"] == 6000
    assert order["total_poisha"] == 30000
    assert order["can_cancel"] is True
    assert order["code"].startswith("HH-ORD-")
    assert len(order["timeline"]) == 1
    assert order["timeline"][0]["status"] == "PENDING"

    # Repeated Idempotency-Key returns the same order.
    replayed = client.post(ORDERS, payload, format="json", headers={"Idempotency-Key": "key-1"})
    assert replayed.status_code == 200
    assert replayed.json()["id"] == order["id"]
    assert Order.objects.count() == 1

    # Cart is now empty.
    assert client.get(CART).json()["items"] == []

    # Price list change does not alter order item snapshots.
    remedies.set_prices(
        remedy, [{"form": RemedyForm.PILL, "price_poisha": 99000, "is_active": True}]
    )
    detail = client.get(f"{ORDERS}{order['id']}/").json()
    assert detail["items"][0]["unit_price_poisha"] == 12000
    assert detail["items"][0]["line_total_poisha"] == 24000
    assert detail["total_poisha"] == 30000

    # No shop keys anywhere in patient order responses.
    assert_no_shop_keys(quote.json())
    assert_no_shop_keys(order)
    assert_no_shop_keys(detail)
    assert_no_shop_keys(client.get(ORDERS).json())


def test_unverified_phone_gets_403_on_checkout(location):
    client = APIClient()
    sign_up(client, location, phone="01755555555")
    patient = Patient.objects.get(phone="+8801755555555")
    client.force_authenticate(user=patient)  # type: ignore[arg-type]
    remedy = make_remedy()
    add_to_cart(client, remedy, quantity=1)

    response = client.post(
        ORDERS,
        {
            "location_id": str(location.id),
            "recipient_name": "Rahima",
            "phone": "01755555555",
            "address_line": "Road 1",
            "payment_method": "COD",
        },
        format="json",
        headers=WEB,
    )
    assert response.status_code == 403
    assert error_code(response) == "PHONE_NOT_VERIFIED"


def test_cancel_while_confirmed_and_refused_once_processing(location):
    client = verified_client(location, phone="01733333333")
    remedy = make_remedy()
    add_to_cart(client, remedy, quantity=1)

    order = client.post(
        ORDERS,
        {
            "location_id": str(location.id),
            "recipient_name": "Rahima",
            "phone": "01733333333",
            "address_line": "Road 2",
            "payment_method": "COD",
        },
        format="json",
    ).json()

    cancelled = client.post(f"{ORDERS}{order['id']}/cancel/", format="json")
    assert cancelled.status_code == 200
    assert cancelled.json()["status"] == "CANCELLED"
    assert cancelled.json()["can_cancel"] is False
    assert [step["status"] for step in cancelled.json()["timeline"]] == ["PENDING", "CANCELLED"]
    assert_no_shop_keys(cancelled.json())

    # Second order set directly to PROCESSING cannot be cancelled by patient.
    add_to_cart(client, remedy, quantity=1)
    second = client.post(
        ORDERS,
        {
            "location_id": str(location.id),
            "recipient_name": "Rahima",
            "phone": "01733333333",
            "address_line": "Road 2",
            "payment_method": "COD",
        },
        format="json",
    ).json()
    Order.objects.filter(pk=second["id"]).update(status=Order.Status.PROCESSING)

    refused = client.post(f"{ORDERS}{second['id']}/cancel/", format="json")
    assert refused.status_code == 409
    assert error_code(refused) == "ORDER_NOT_CANCELLABLE"
