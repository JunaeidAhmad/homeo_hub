"""Cart: self-prescription source lines, quantity cap, server-side pricing, and isolation."""

import pytest
from django.db import IntegrityError
from rest_framework.test import APIClient

from apps.illnesses import services as illnesses
from apps.orders.models import Cart, CartItem
from apps.remedies import services as remedies
from apps.remedies.choices import Potency, RemedyForm
from apps.remedies.models import Remedy
from apps.selfcare.models import SelfPrescriptionItem
from tests.auth_helpers import error_code, verified_patient

pytestmark = pytest.mark.django_db

CART = "/api/v1/cart/"
CART_ITEMS = "/api/v1/cart/items/"


def make_patient_client(location, phone: str = "01712345678") -> APIClient:
    client = APIClient()
    session = verified_patient(client, location, phone=phone)
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {session['access_token']}")
    return client


def make_remedy(
    name: str = "Nux vomica", pill_poisha: int = 12000, liquid_poisha: int = 15000
) -> Remedy:
    remedy = remedies.create_remedy(
        name=name,
        status=Remedy.Status.ACTIVE,
        description_en="Classical remedy.",
        indication_en="Digestive upset.",
        advice_do_en="Rest",
        advice_dont_en="Coffee",
    )
    remedies.set_prices(
        remedy,
        [
            {"form": RemedyForm.PILL, "price_poisha": pill_poisha, "is_active": True},
            {"form": RemedyForm.LIQUID, "price_poisha": liquid_poisha, "is_active": True},
        ],
    )
    return remedy


def test_guest_gets_401():
    visitor = APIClient()
    assert visitor.get(CART).status_code == 401
    assert visitor.post(CART_ITEMS, {}, format="json").status_code == 401


def test_same_choice_twice_makes_one_line_and_caps_at_ten(location):
    client = make_patient_client(location)
    remedy = make_remedy(pill_poisha=10000)
    category = illnesses.create_category(name_en="Digestive", is_active=True)
    illness = illnesses.create_illness(
        category=category,
        name_en="Acidity",
        short_description_en="Upper stomach burning.",
        status="ACTIVE",
    )

    payload = {
        "remedy_id": str(remedy.id),
        "illness_id": str(illness.id),
        "potency": Potency.P30C,
        "form": RemedyForm.PILL,
        "quantity": 6,
    }
    first = client.post(CART_ITEMS, payload, format="json")
    assert first.status_code == 200, first.content
    assert first.json()["item_count"] == 6
    assert first.json()["subtotal_poisha"] == 60000
    assert len(first.json()["items"]) == 1
    assert first.json()["items"][0]["illness_name"] == "Acidity"

    second = client.post(CART_ITEMS, {**payload, "quantity": 7}, format="json")
    assert second.status_code == 200
    assert len(second.json()["items"]) == 1
    assert second.json()["items"][0]["quantity"] == 10
    assert second.json()["item_count"] == 10
    assert second.json()["subtotal_poisha"] == 100000
    assert SelfPrescriptionItem.objects.count() == 1

    item_id = second.json()["items"][0]["id"]
    too_many = client.patch(f"{CART_ITEMS}{item_id}/", {"quantity": 11}, format="json")
    assert too_many.status_code == 400
    assert error_code(too_many) == "QUANTITY_OUT_OF_RANGE"


def test_db_check_refuses_cart_item_without_source(location):
    client = make_patient_client(location)
    cart_data = client.get(CART).json()
    cart = Cart.objects.get(pk=cart_data["id"])

    with pytest.raises(IntegrityError):
        CartItem.objects.create(cart=cart, self_prescription_item=None, quantity=1)


def test_totals_come_from_price_list_and_unavailable_lines_excluded(location):
    client = make_patient_client(location)
    remedy = make_remedy(pill_poisha=12500)

    response = client.post(
        CART_ITEMS,
        {
            "remedy_id": str(remedy.id),
            "potency": Potency.P200C,
            "form": RemedyForm.PILL,
            "quantity": 2,
            "unit_price_poisha": 1,  # ignored by server
        },
        format="json",
    )
    assert response.status_code == 200
    data = response.json()
    assert data["items"][0]["unit_price_poisha"] == 12500
    assert data["items"][0]["line_total_poisha"] == 25000
    assert data["subtotal_poisha"] == 25000
    assert data["items"][0]["available"] is True

    # Deactivate the price: line becomes unavailable and drops out of subtotal.
    remedies.set_prices(
        remedy, [{"form": RemedyForm.PILL, "price_poisha": 12500, "is_active": False}]
    )
    refreshed = client.get(CART).json()
    assert refreshed["items"][0]["available"] is False
    assert refreshed["subtotal_poisha"] == 0


def test_patient_cannot_touch_another_patients_cart_item(location):
    alice = make_patient_client(location, phone="01711111111")
    bob = make_patient_client(location, phone="01722222222")
    remedy = make_remedy()

    added = alice.post(
        CART_ITEMS,
        {
            "remedy_id": str(remedy.id),
            "potency": Potency.P30C,
            "form": RemedyForm.LIQUID,
            "quantity": 1,
        },
        format="json",
    ).json()
    item_id = added["items"][0]["id"]

    assert bob.patch(f"{CART_ITEMS}{item_id}/", {"quantity": 3}, format="json").status_code == 404
    assert bob.delete(f"{CART_ITEMS}{item_id}/").status_code == 404
