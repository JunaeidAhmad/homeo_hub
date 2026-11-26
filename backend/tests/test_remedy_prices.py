"""Patient price list: uniqueness, active-only public visibility, and key whitelisting."""

import pytest
from django.db import IntegrityError
from rest_framework.test import APIClient

from apps.remedies.choices import Potency, RemedyForm
from apps.remedies.models import Remedy, RemedyPrice
from apps.remedies.selectors import patient_price
from apps.staff import services as staff
from apps.staff.roles import Role
from tests.auth_helpers import PASSWORD, WEB

pytestmark = pytest.mark.django_db

PUBLIC = "/api/v1/remedies/"
ADMIN = "/api/v1/admin/remedies/"

CARD_KEYS = {"id", "name", "name_bn", "slug", "picture_url", "indication", "prices"}
DETAIL_KEYS = CARD_KEYS | {"description", "advice_do", "advice_dont", "potencies"}
PRICE_KEYS = {"form", "price_poisha"}


@pytest.fixture
def editor() -> APIClient:
    staff.seed_roles()
    staff.create_staff(
        username="remedy_mgr",
        full_name="Remedy Manager",
        password=PASSWORD,
        roles=[Role.REMEDY_MANAGER],
    )
    client = APIClient()
    token = client.post(
        "/api/v1/auth/staff/login/",
        {"username": "remedy_mgr", "password": PASSWORD},
        format="json",
        headers=WEB,
    ).json()["access_token"]
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    return client


def create_remedy(editor: APIClient, name: str = "Arsenicum album", status: str = "ACTIVE") -> dict:
    response = editor.post(
        ADMIN,
        {
            "name": name,
            "status": status,
            "description_en": "A classical remedy.",
            "indication_en": "Burning pains.",
            "advice_do_en": "Rest",
            "advice_dont_en": "Coffee",
        },
        format="json",
    )
    assert response.status_code == 201, response.content
    return response.json()


def test_only_one_price_per_remedy_and_form_at_model_level(editor):
    created = create_remedy(editor)
    remedy = Remedy.objects.get(pk=created["id"])
    RemedyPrice.objects.create(remedy=remedy, form=RemedyForm.PILL, price_poisha=12000)

    with pytest.raises(IntegrityError):
        RemedyPrice.objects.create(remedy=remedy, form=RemedyForm.PILL, price_poisha=15000)


def test_put_prices_upserts_and_allows_partial_forms(editor):
    remedy = create_remedy(editor)
    url = f"{ADMIN}{remedy['id']}/prices/"

    first = editor.put(
        url,
        [
            {"form": "PILL", "price_poisha": 12000, "is_active": True},
            {"form": "LIQUID", "price_poisha": 15000, "is_active": True},
        ],
        format="json",
    )
    assert first.status_code == 200, first.content
    assert {(p["form"], p["price_poisha"], p["is_active"]) for p in first.json()["prices"]} == {
        ("PILL", 12000, True),
        ("LIQUID", 15000, True),
    }

    updated = editor.put(
        url,
        [{"form": "LIQUID", "price_poisha": 16500, "is_active": False}],
        format="json",
    )
    assert updated.status_code == 200, updated.content
    assert {(p["form"], p["price_poisha"], p["is_active"]) for p in updated.json()["prices"]} == {
        ("PILL", 12000, True),
        ("LIQUID", 16500, False),
    }
    assert RemedyPrice.objects.filter(remedy_id=remedy["id"]).count() == 2


def test_public_endpoints_return_only_active_prices_and_whitelisted_keys(editor):
    remedy = create_remedy(editor)
    editor.put(
        f"{ADMIN}{remedy['id']}/prices/",
        [
            {"form": "PILL", "price_poisha": 12000, "is_active": True},
            {"form": "LIQUID", "price_poisha": 15000, "is_active": False},
        ],
        format="json",
    )

    visitor = APIClient()
    listed = visitor.get(PUBLIC).json()["results"]
    assert len(listed) == 1
    assert set(listed[0]) == CARD_KEYS
    assert listed[0]["prices"] == [{"form": "PILL", "price_poisha": 12000}]
    assert set(listed[0]["prices"][0]) == PRICE_KEYS

    detail = visitor.get(f"{PUBLIC}{remedy['slug']}/").json()
    assert set(detail) == DETAIL_KEYS
    assert detail["prices"] == [{"form": "PILL", "price_poisha": 12000}]
    assert detail["potencies"] == list(Potency.values)


def test_patient_price_selector_respects_active_flags(editor):
    active = create_remedy(editor, name="Belladonna", status="ACTIVE")
    draft = create_remedy(editor, name="Pulsatilla", status="DRAFT")
    editor.put(
        f"{ADMIN}{active['id']}/prices/",
        [
            {"form": "PILL", "price_poisha": 9000, "is_active": True},
            {"form": "LIQUID", "price_poisha": 11000, "is_active": False},
        ],
        format="json",
    )
    editor.put(
        f"{ADMIN}{draft['id']}/prices/",
        [{"form": "PILL", "price_poisha": 8000, "is_active": True}],
        format="json",
    )

    active_obj = Remedy.objects.get(pk=active["id"])
    draft_obj = Remedy.objects.get(pk=draft["id"])

    assert patient_price(active_obj, RemedyForm.PILL) == 9000
    assert patient_price(active_obj, RemedyForm.LIQUID) is None
    assert patient_price(draft_obj, RemedyForm.PILL) is None


def test_non_remedy_manager_cannot_set_prices(editor):
    remedy = create_remedy(editor)
    staff.create_staff(
        username="support_user",
        full_name="Support",
        password=PASSWORD,
        roles=[Role.SUPPORT],
    )
    support = APIClient()
    token = support.post(
        "/api/v1/auth/staff/login/",
        {"username": "support_user", "password": PASSWORD},
        format="json",
        headers=WEB,
    ).json()["access_token"]
    support.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")

    response = support.put(
        f"{ADMIN}{remedy['id']}/prices/",
        [{"form": "PILL", "price_poisha": 10000, "is_active": True}],
        format="json",
    )
    assert response.status_code == 403
