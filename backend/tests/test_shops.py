"""Shops, shop staff, shop price lists, owner scoping, and public leak checks."""

from typing import Any

import pytest
from rest_framework.test import APIClient

from apps.illnesses import services as illnesses
from apps.remedies import services as remedies
from apps.remedies.choices import Potency, RemedyForm
from apps.remedies.models import Remedy
from apps.shops.models import ShopRemedy
from apps.staff import services as staff
from apps.staff.roles import Role
from tests.auth_helpers import PASSWORD, WEB, error_code, verified_patient

pytestmark = pytest.mark.django_db

SHOPS = "/api/v1/admin/shops/"
SHOP_REMEDIES = "/api/v1/admin/shop-remedies/"
CANDIDATES = "/api/v1/admin/shop-staff-candidates/"


def staff_client(username: str, role: Role) -> tuple[APIClient, Any]:
    staff.seed_roles()
    user = staff.create_staff(
        username=username, full_name=username, password=PASSWORD, roles=[role]
    )
    client = APIClient()
    token = client.post(
        "/api/v1/auth/staff/login/",
        {"username": username, "password": PASSWORD},
        format="json",
        headers=WEB,
    ).json()["access_token"]
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    return client, user


def assert_no_shop_or_price_leak(payload: Any, secret_price: int) -> None:
    if isinstance(payload, dict):
        for key, value in payload.items():
            assert "shop" not in key.lower(), f"Shop key leaked: {key}"
            assert_no_shop_or_price_leak(value, secret_price)
    elif isinstance(payload, list):
        for item in payload:
            assert_no_shop_or_price_leak(item, secret_price)
    elif isinstance(payload, int) and not isinstance(payload, bool):
        assert payload != secret_price, f"Shop price {secret_price} leaked!"


def make_remedy(name: str = "Rhus tox", patient_poisha: int = 12000) -> Remedy:
    remedy = remedies.create_remedy(
        name=name,
        status=Remedy.Status.ACTIVE,
        description_en="Joint stiffness remedy.",
        indication_en="Pain worse on initial motion.",
        advice_do_en="Warmth",
        advice_dont_en="Cold",
    )
    remedies.set_prices(
        remedy, [{"form": RemedyForm.PILL, "price_poisha": patient_poisha, "is_active": True}]
    )
    return remedy


def test_shop_owner_sees_only_own_shop_and_cannot_create_or_verify(location):
    admin_client, _ = staff_client("admin_user", Role.ADMIN)
    owner_a_client, owner_a = staff_client("owner_a", Role.SHOP_OWNER)
    owner_b_client, owner_b = staff_client("owner_b", Role.SHOP_OWNER)
    _, support_user = staff_client("support_user", Role.SUPPORT)

    shop_a = admin_client.post(
        SHOPS,
        {
            "name": "Dhaka Homeo Hall",
            "location_id": str(location.id),
            "address_line": "10 Elephant Road",
            "phone": "01711111111",
            "is_verified": True,
        },
        format="json",
    ).json()
    shop_b = admin_client.post(
        SHOPS,
        {
            "name": "Gazipur Dispensary",
            "location_id": str(location.id),
            "address_line": "5 Main Road",
            "phone": "01722222222",
            "is_verified": True,
        },
        format="json",
    ).json()

    # Non-shop-owner cannot be linked.
    bad_link = admin_client.post(
        f"{SHOPS}{shop_a['id']}/staff/",
        {"user_id": support_user.id, "role": "OWNER"},
        format="json",
    )
    assert bad_link.status_code == 400
    assert error_code(bad_link) == "NOT_SHOP_STAFF"

    # Link owner_a to shop_a and owner_b to shop_b.
    assert (
        admin_client.post(
            f"{SHOPS}{shop_a['id']}/staff/",
            {"user_id": owner_a.id, "role": "OWNER"},
            format="json",
        ).status_code
        == 201
    )
    assert (
        admin_client.post(
            f"{SHOPS}{shop_b['id']}/staff/",
            {"user_id": owner_b.id, "role": "OWNER"},
            format="json",
        ).status_code
        == 201
    )

    candidates = admin_client.get(CANDIDATES).json()
    assert {c["username"] for c in candidates} == {"owner_a", "owner_b"}

    remedy = make_remedy()
    listing_b = owner_b_client.post(
        f"{SHOPS}{shop_b['id']}/remedies/",
        {
            "remedy_id": str(remedy.id),
            "pack_size": 10,
            "unit": "ML",
            "price_poisha": 8500,
            "stock_qty": 20,
        },
        format="json",
    )
    assert listing_b.status_code == 201, listing_b.content
    listing_b_id = listing_b.json()["id"]

    # Owner A sees only shop A, and gets 404 reading/editing shop B or its listings.
    listed = owner_a_client.get(SHOPS).json()["results"]
    assert [s["id"] for s in listed] == [shop_a["id"]]
    assert owner_a_client.get(f"{SHOPS}{shop_b['id']}/").status_code == 404
    assert owner_a_client.get(f"{SHOPS}{shop_b['id']}/remedies/").status_code == 404
    assert (
        owner_a_client.patch(
            f"{SHOP_REMEDIES}{listing_b_id}/", {"price_poisha": 9999}, format="json"
        ).status_code
        == 404
    )

    # Owner A cannot create shops or PATCH verification.
    assert (
        owner_a_client.post(
            SHOPS,
            {
                "name": "Unauthorized",
                "location_id": str(location.id),
                "address_line": "X",
                "phone": "01733333333",
            },
            format="json",
        ).status_code
        == 403
    )
    assert (
        owner_a_client.patch(
            f"{SHOPS}{shop_a['id']}/", {"is_verified": False}, format="json"
        ).status_code
        == 403
    )

    # /admin/me includes owner's linked shops.
    me = owner_a_client.get("/api/v1/admin/me/").json()
    assert me["shops"] == [{"id": shop_a["id"], "name": "Dhaka Homeo Hall"}]


def test_duplicate_listing_pack_and_in_use_delete_are_refused(location):
    admin_client, _ = staff_client("admin_dup", Role.ADMIN)
    shop = admin_client.post(
        SHOPS,
        {
            "name": "City Homeo",
            "location_id": str(location.id),
            "address_line": "12 Green Road",
            "phone": "01744444444",
        },
        format="json",
    ).json()
    remedy = make_remedy("Sulphur")

    payload = {
        "remedy_id": str(remedy.id),
        "pack_size": 30,
        "unit": "ML",
        "price_poisha": 10000,
        "stock_qty": 5,
    }
    first = admin_client.post(f"{SHOPS}{shop['id']}/remedies/", payload, format="json")
    assert first.status_code == 201
    dup = admin_client.post(f"{SHOPS}{shop['id']}/remedies/", payload, format="json")
    assert dup.status_code == 409
    assert error_code(dup) == "LISTING_EXISTS"

    listing_id = first.json()["id"]
    ShopRemedy.objects.filter(pk=listing_id).update(reserved_qty=2)
    in_use = admin_client.delete(f"{SHOP_REMEDIES}{listing_id}/")
    assert in_use.status_code == 409
    assert error_code(in_use) == "LISTING_IN_USE"


def test_shop_price_and_keys_never_leak_to_public_or_patient_endpoints(location):
    secret_price = 98765
    admin_client, _ = staff_client("admin_leak", Role.ADMIN)
    shop = admin_client.post(
        SHOPS,
        {
            "name": "Secret Price Shop",
            "location_id": str(location.id),
            "address_line": "99 Secret St",
            "phone": "01766666666",
            "is_verified": True,
        },
        format="json",
    ).json()
    remedy = make_remedy("Aconite", patient_poisha=12000)
    category = illnesses.create_category(name_en="Fever", is_active=True)
    illness = illnesses.create_illness(
        category=category,
        name_en="Sudden fever",
        short_description_en="High fever after cold wind.",
        status="ACTIVE",
    )
    illnesses.set_ranked_remedies(illness, [remedy.id])

    created = admin_client.post(
        f"{SHOPS}{shop['id']}/remedies/",
        {
            "remedy_id": str(remedy.id),
            "pack_size": 10,
            "unit": "ML",
            "price_poisha": secret_price,
            "stock_qty": 15,
        },
        format="json",
    )
    assert created.status_code == 201

    visitor = APIClient()
    assert_no_shop_or_price_leak(visitor.get("/api/v1/remedies/").json(), secret_price)
    assert_no_shop_or_price_leak(
        visitor.get(f"/api/v1/remedies/{remedy.slug}/").json(), secret_price
    )
    assert_no_shop_or_price_leak(
        visitor.get(f"/api/v1/illnesses/{illness.slug}/").json(), secret_price
    )

    patient_client = APIClient()
    session = verified_patient(patient_client, location, phone="01777777777")
    patient_client.credentials(HTTP_AUTHORIZATION=f"Bearer {session['access_token']}")
    cart = patient_client.post(
        "/api/v1/cart/items/",
        {
            "remedy_id": str(remedy.id),
            "illness_id": str(illness.id),
            "potency": Potency.P30C,
            "form": RemedyForm.PILL,
            "quantity": 1,
        },
        format="json",
    ).json()
    assert_no_shop_or_price_leak(cart, secret_price)

    order = patient_client.post(
        "/api/v1/orders/",
        {
            "location_id": str(location.id),
            "recipient_name": "Rahima",
            "phone": "01777777777",
            "address_line": "Road 4",
            "payment_method": "COD",
        },
        format="json",
    ).json()
    assert_no_shop_or_price_leak(order, secret_price)
    assert_no_shop_or_price_leak(
        patient_client.get(f"/api/v1/orders/{order['id']}/").json(), secret_price
    )
