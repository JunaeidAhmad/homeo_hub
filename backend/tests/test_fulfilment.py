"""Order fulfilment: shop assignment, stock lifecycle, COD payments, and patient status."""

from typing import Any

import pytest
from rest_framework.test import APIClient

from apps.locations.models import Location
from apps.payments.models import Payment
from apps.remedies import services as remedies
from apps.remedies.choices import Potency, RemedyForm
from apps.remedies.models import Remedy
from apps.shops import services as shops
from apps.staff import services as staff
from apps.staff.roles import Role
from tests.auth_helpers import PASSWORD, WEB, error_code, staff_phone, verified_patient

pytestmark = pytest.mark.django_db

ADMIN_ORDERS = "/api/v1/admin/orders/"


def staff_client(username: str, role: Role) -> APIClient:
    staff.seed_roles()
    staff.create_staff(
        phone=staff_phone(username), full_name=username, password=PASSWORD, roles=[role]
    )
    client = APIClient()
    token = client.post(
        "/api/v1/auth/staff/login/",
        {"phone": staff_phone(username), "password": PASSWORD},
        format="json",
        headers=WEB,
    ).json()["access_token"]
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    return client


def assert_no_shop_keys(payload: Any) -> None:
    if isinstance(payload, dict):
        for key, value in payload.items():
            assert "shop" not in key.lower(), f"Shop key leaked: {key}"
            assert_no_shop_keys(value)
    elif isinstance(payload, list):
        for item in payload:
            assert_no_shop_keys(item)


def make_remedy(name: str, patient_poisha: int = 12000) -> Remedy:
    remedy = remedies.create_remedy(
        name=name,
        status=Remedy.Status.ACTIVE,
        description_en="Classical remedy.",
        indication_en="Indicated.",
        advice_do_en="Rest",
        advice_dont_en="Coffee",
    )
    remedies.set_prices(
        remedy, [{"form": RemedyForm.PILL, "price_poisha": patient_poisha, "is_active": True}]
    )
    return remedy


def place_order(location: Location, items: list[tuple[Remedy, int]]) -> tuple[APIClient, dict]:
    client = APIClient()
    session = verified_patient(client, location, phone="01712345678")
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {session['access_token']}")
    for remedy, qty in items:
        assert (
            client.post(
                "/api/v1/cart/items/",
                {
                    "remedy_id": str(remedy.id),
                    "potency": Potency.P30C,
                    "form": RemedyForm.PILL,
                    "quantity": qty,
                },
                format="json",
            ).status_code
            == 200
        )
    order = client.post(
        "/api/v1/orders/",
        {
            "location_id": str(location.id),
            "recipient_name": "Rahima",
            "phone": "01712345678",
            "address_line": "Road 10",
            "payment_method": "COD",
        },
        format="json",
    )
    assert order.status_code == 201, order.content
    return client, order.json()


def test_stock_reserves_commits_returns_and_releases_on_cancel(location):
    fulfil = staff_client("fulfil_1", Role.FULFILMENT_MANAGER)
    rem_a = make_remedy("Arnica", 12000)
    rem_b = make_remedy("Bryonia", 15000)
    shop = shops.create_shop(
        name="Dhaka Shop",
        location=location,
        address_line="1 Road",
        phone="01711111111",
        is_verified=True,
    )
    sr_a = shops.create_listing(
        shop=shop, remedy=rem_a, pack_size=10, unit="ML", price_poisha=9000, stock_qty=10
    )
    sr_b = shops.create_listing(
        shop=shop, remedy=rem_b, pack_size=10, unit="ML", price_poisha=10000, stock_qty=5
    )

    _, order = place_order(location, [(rem_a, 2), (rem_b, 1)])
    item_a, item_b = order["items"]

    # Assign both lines to the same shop -> one ShopAssignment reused.
    res1 = fulfil.post(
        f"{ADMIN_ORDERS}{order['id']}/items/{item_a['id']}/assign/",
        {"shop_remedy_id": str(sr_a.id)},
        format="json",
    )
    assert res1.status_code == 200
    res2 = fulfil.post(
        f"{ADMIN_ORDERS}{order['id']}/items/{item_b['id']}/assign/",
        {"shop_remedy_id": str(sr_b.id)},
        format="json",
    )
    assert res2.status_code == 200
    detail = res2.json()
    assert len(detail["assignments"]) == 1
    assignment_id = detail["assignments"][0]["id"]
    assert detail["assignments"][0]["shop_total_poisha"] == 9000 * 2 + 10000

    sr_a.refresh_from_db()
    sr_b.refresh_from_db()
    assert sr_a.reserved_qty == 2
    assert sr_b.reserved_qty == 1

    # Cancel while ASSIGNED releases reservations.
    cancelled = fulfil.post(
        f"{ADMIN_ORDERS}{order['id']}/cancel/", {"reason": "Customer requested"}, format="json"
    )
    assert cancelled.status_code == 200
    assert cancelled.json()["status"] == "CANCELLED"
    sr_a.refresh_from_db()
    sr_b.refresh_from_db()
    assert sr_a.reserved_qty == 0
    assert sr_b.reserved_qty == 0

    # Place a second order, pack -> ship -> return restores stock.
    client2 = APIClient()
    session2 = verified_patient(client2, location, phone="01799999999")
    client2.credentials(HTTP_AUTHORIZATION=f"Bearer {session2['access_token']}")
    client2.post(
        "/api/v1/cart/items/",
        {
            "remedy_id": str(rem_a.id),
            "potency": Potency.P30C,
            "form": RemedyForm.PILL,
            "quantity": 3,
        },
        format="json",
    )
    order2 = client2.post(
        "/api/v1/orders/",
        {
            "location_id": str(location.id),
            "recipient_name": "Karim",
            "phone": "01799999999",
            "address_line": "Road 2",
            "payment_method": "COD",
        },
        format="json",
    ).json()
    item2 = order2["items"][0]
    assigned2 = fulfil.post(
        f"{ADMIN_ORDERS}{order2['id']}/items/{item2['id']}/assign/",
        {"shop_remedy_id": str(sr_a.id)},
        format="json",
    ).json()
    aid2 = assigned2["assignments"][0]["id"]

    # Packing commits stock.
    fulfil.post(
        f"/api/v1/admin/shop-assignments/{aid2}/status/", {"status": "PROCESSING"}, format="json"
    )
    sr_a.refresh_from_db()
    assert (sr_a.stock_qty, sr_a.reserved_qty) == (7, 0)

    # Ship and return puts stock back.
    fulfil.post(
        f"/api/v1/admin/shop-assignments/{aid2}/status/", {"status": "SHIPPED"}, format="json"
    )
    returned = fulfil.post(
        f"/api/v1/admin/shop-assignments/{aid2}/status/", {"status": "RETURNED"}, format="json"
    )
    assert returned.status_code == 200
    assert returned.json()["status"] == "RETURNED"
    sr_a.refresh_from_db()
    assert sr_a.stock_qty == 10
    _ = assignment_id


def test_not_enough_free_stock_returns_409(location):
    fulfil = staff_client("fulfil_2", Role.FULFILMENT_MANAGER)
    rem = make_remedy("Pulsatilla")
    shop = shops.create_shop(
        name="Small Shop",
        location=location,
        address_line="2 Road",
        phone="01722222222",
        is_verified=True,
    )
    sr = shops.create_listing(
        shop=shop, remedy=rem, pack_size=10, unit="ML", price_poisha=8000, stock_qty=2
    )
    _, order = place_order(location, [(rem, 3)])
    item = order["items"][0]

    resp = fulfil.post(
        f"{ADMIN_ORDERS}{order['id']}/items/{item['id']}/assign/",
        {"shop_remedy_id": str(sr.id)},
        format="json",
    )
    assert resp.status_code == 409
    assert error_code(resp) == "NOT_ENOUGH_STOCK"


def test_cod_delivery_requires_amount_and_patient_status_follows_assignments(location):
    fulfil = staff_client("fulfil_3", Role.FULFILMENT_MANAGER)
    other_loc = Location.objects.create(
        division_en="Chattogram",
        division_bn="চট্টগ্রাম",
        district_en="Chattogram",
        district_bn="চট্টগ্রাম",
        upazila_en="Pahartali",
        upazila_bn="পাহাড়তলী",
    )
    rem_a = make_remedy("Belladonna", 10000)
    rem_b = make_remedy("Nux vomica", 15000)
    shop1 = shops.create_shop(
        name="Shop One",
        location=location,
        address_line="1A",
        phone="01733333333",
        is_verified=True,
    )
    shop2 = shops.create_shop(
        name="Shop Two",
        location=other_loc,
        address_line="2B",
        phone="01744444444",
        is_verified=True,
    )
    sr1 = shops.create_listing(
        shop=shop1, remedy=rem_a, pack_size=10, unit="ML", price_poisha=7000, stock_qty=10
    )
    sr2 = shops.create_listing(
        shop=shop2, remedy=rem_b, pack_size=10, unit="ML", price_poisha=9000, stock_qty=10
    )

    patient_client, order = place_order(location, [(rem_a, 1), (rem_b, 1)])
    item_a, item_b = order["items"]

    # Candidates sort same upazila first.
    sr1_other = shops.create_listing(
        shop=shop2, remedy=rem_a, pack_size=10, unit="ML", price_poisha=6000, stock_qty=20
    )
    candidates = fulfil.get(f"{ADMIN_ORDERS}{order['id']}/items/{item_a['id']}/candidates/").json()
    assert [c["shop_remedy_id"] for c in candidates] == [str(sr1.id), str(sr1_other.id)]
    assert candidates[0]["area_match"] == "UPAZILA"
    assert candidates[1]["area_match"] == "OTHER"

    assert order["status"] == "PENDING"
    first = fulfil.post(
        f"{ADMIN_ORDERS}{order['id']}/items/{item_a['id']}/assign/",
        {"shop_remedy_id": str(sr1.id)},
        format="json",
    ).json()
    # One line still has no shop, so the order is not confirmed yet.
    assert first["status"] == "PENDING"
    assigned = fulfil.post(
        f"{ADMIN_ORDERS}{order['id']}/items/{item_b['id']}/assign/",
        {"shop_remedy_id": str(sr2.id)},
        format="json",
    ).json()
    assert assigned["status"] == "CONFIRMED"
    a1, a2 = assigned["assignments"]

    # Expected COD: first assignment includes delivery charge (6000), second does not.
    assert a1["expected_cod_poisha"] == 10000 + 6000
    assert a2["expected_cod_poisha"] == 15000

    # Ship assignment 1 -> order becomes SHIPPED.
    fulfil.post(
        f"/api/v1/admin/shop-assignments/{a1['id']}/status/",
        {"status": "PROCESSING"},
        format="json",
    )
    fulfil.post(
        f"/api/v1/admin/shop-assignments/{a1['id']}/status/", {"status": "SHIPPED"}, format="json"
    )
    assert patient_client.get(f"/api/v1/orders/{order['id']}/").json()["status"] == "SHIPPED"

    # Deliver assignment 1 without cash amount -> 400.
    missing_cash = fulfil.post(
        f"/api/v1/admin/shop-assignments/{a1['id']}/status/",
        {"status": "DELIVERED"},
        format="json",
    )
    assert missing_cash.status_code == 400
    assert error_code(missing_cash) == "CASH_AMOUNT_REQUIRED"

    # Deliver assignment 1 with cash -> creates SUCCESS COD payment;
    # order stays SHIPPED until assignment 2 delivers.
    d1 = fulfil.post(
        f"/api/v1/admin/shop-assignments/{a1['id']}/status/",
        {"status": "DELIVERED", "cash_collected_poisha": 16000},
        format="json",
    )
    assert d1.status_code == 200
    assert d1.json()["status"] == "SHIPPED"
    assert Payment.objects.filter(order_id=order["id"], status="SUCCESS", method="COD").count() == 1

    # Deliver assignment 2 -> order becomes DELIVERED.
    fulfil.post(
        f"/api/v1/admin/shop-assignments/{a2['id']}/status/",
        {"status": "PROCESSING"},
        format="json",
    )
    fulfil.post(
        f"/api/v1/admin/shop-assignments/{a2['id']}/status/", {"status": "SHIPPED"}, format="json"
    )
    d2 = fulfil.post(
        f"/api/v1/admin/shop-assignments/{a2['id']}/status/",
        {"status": "DELIVERED", "cash_collected_poisha": 15000},
        format="json",
    )
    assert d2.status_code == 200
    assert d2.json()["status"] == "DELIVERED"

    # Patient detail still has zero shop keys and order-level timeline only.
    patient_detail = patient_client.get(f"/api/v1/orders/{order['id']}/").json()
    assert patient_detail["status"] == "DELIVERED"
    assert_no_shop_keys(patient_detail)
    assert [t["status"] for t in patient_detail["timeline"]] == [
        "PENDING",
        "CONFIRMED",
        "PROCESSING",
        "SHIPPED",
        "DELIVERED",
    ]


def test_unassigning_keeps_the_shop_history_and_patients_still_never_see_it(location):
    fulfil = staff_client("fulfil_hist", Role.FULFILMENT_MANAGER)
    remedy = make_remedy("Arnica")
    shop = shops.create_shop(
        name="Mirpur Shop",
        location=location,
        address_line="2 Road",
        phone="01722222222",
        is_verified=True,
    )
    listing = shops.create_listing(
        shop=shop, remedy=remedy, pack_size=10, unit="ML", price_poisha=9000, stock_qty=10
    )
    patient, order = place_order(location, [(remedy, 1)])
    item_url = f"{ADMIN_ORDERS}{order['id']}/items/{order['items'][0]['id']}/assign/"

    assigned = fulfil.post(item_url, {"shop_remedy_id": str(listing.id)}, format="json")
    assert assigned.status_code == 200, assigned.content
    # The line was the shop's only one, so unassigning deletes the assignment itself.
    detail = fulfil.delete(item_url).json()
    assert detail["assignments"] == []

    notes = {(row["note"], row["shop_name"]) for row in detail["history"]}
    assert ("Assigned Arnica", "Mirpur Shop") in notes
    assert ("Unassigned Arnica", "Mirpur Shop") in notes

    timeline = patient.get(f"/api/v1/orders/{order['id']}/").json()["timeline"]
    assert all("Arnica" not in (row.get("note") or "") for row in timeline)
    assert_no_shop_keys(timeline)
