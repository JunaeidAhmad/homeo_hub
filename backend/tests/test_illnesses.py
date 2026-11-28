"""Illness library and ranked remedies: permissions, ranking order, and active-only public views."""

import pytest
from django.db import IntegrityError
from rest_framework.test import APIClient

from apps.illnesses.models import Illness, IllnessCategory, IllnessRemedy
from apps.remedies import services as remedies
from apps.remedies.choices import RemedyForm
from apps.remedies.models import Remedy
from apps.staff import services as staff
from apps.staff.roles import Role
from tests.auth_helpers import PASSWORD, WEB, error_code, staff_phone

pytestmark = pytest.mark.django_db

CATEGORIES_ADMIN = "/api/v1/admin/illness-categories/"
ILLNESSES_ADMIN = "/api/v1/admin/illnesses/"
CATEGORIES_PUBLIC = "/api/v1/illness-categories/"
ILLNESSES_PUBLIC = "/api/v1/illnesses/"


def staff_client(role: Role) -> APIClient:
    staff.seed_roles()
    staff.create_staff(phone=staff_phone(role), full_name=role, password=PASSWORD, roles=[role])
    client = APIClient()
    token = client.post(
        "/api/v1/auth/staff/login/",
        {"phone": staff_phone(role), "password": PASSWORD},
        format="json",
        headers=WEB,
    ).json()["access_token"]
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    return client


@pytest.fixture
def manager() -> APIClient:
    return staff_client(Role.ILLNESS_MANAGER)


def make_remedy(name: str, status: str = Remedy.Status.ACTIVE, price_poisha: int = 12000) -> Remedy:
    remedy = remedies.create_remedy(
        name=name,
        status=status,
        description_en="Classical description.",
        indication_en=f"When to use {name}.",
        advice_do_en="Rest",
        advice_dont_en="Coffee",
    )
    remedies.set_prices(
        remedy, [{"form": RemedyForm.PILL, "price_poisha": price_poisha, "is_active": True}]
    )
    return remedy


def make_category(manager: APIClient, name: str = "Digestive", **extra) -> dict:
    response = manager.post(
        CATEGORIES_ADMIN,
        {"name_en": name, "name_bn": "পরিপাক", "is_active": True, **extra},
        format="json",
    )
    assert response.status_code == 201, response.content
    return response.json()


def make_illness(manager: APIClient, category_id: str, name: str = "Acidity", **extra) -> dict:
    response = manager.post(
        ILLNESSES_ADMIN,
        {
            "category": category_id,
            "name_en": name,
            "name_bn": "অ্যাসিডিটি",
            "short_description_en": "Burning discomfort in the upper stomach.",
            "status": "ACTIVE",
            **extra,
        },
        format="json",
    )
    assert response.status_code == 201, response.content
    return response.json()


def test_non_illness_manager_is_refused(manager):
    category = make_category(manager)
    illness = make_illness(manager, category["id"])
    other = staff_client(Role.REMEDY_MANAGER)

    assert other.get(CATEGORIES_ADMIN).status_code == 403
    assert other.get(ILLNESSES_ADMIN).status_code == 403
    assert (
        other.put(
            f"{ILLNESSES_ADMIN}{illness['id']}/remedies/", {"remedy_ids": []}, format="json"
        ).status_code
        == 403
    )


def test_ranking_order_preserved_after_reorder_put(manager):
    category = make_category(manager)
    illness = make_illness(manager, category["id"])
    first = make_remedy("Nux vomica", price_poisha=11000)
    second = make_remedy("Carbo vegetabilis", price_poisha=13000)
    third = make_remedy("Pulsatilla", price_poisha=14000)

    url = f"{ILLNESSES_ADMIN}{illness['id']}/remedies/"
    put_one = manager.put(
        url, {"remedy_ids": [str(first.id), str(second.id), str(third.id)]}, format="json"
    )
    assert put_one.status_code == 200
    assert [row["remedy_name"] for row in put_one.json()] == [
        "Nux vomica",
        "Carbo vegetabilis",
        "Pulsatilla",
    ]

    put_two = manager.put(
        url, {"remedy_ids": [str(third.id), str(first.id), str(second.id)]}, format="json"
    )
    assert put_two.status_code == 200
    assert [(row["rank"], row["remedy_name"]) for row in put_two.json()] == [
        (1, "Pulsatilla"),
        (2, "Nux vomica"),
        (3, "Carbo vegetabilis"),
    ]

    detail = APIClient().get(f"{ILLNESSES_PUBLIC}{illness['slug']}/").json()
    assert [(r["rank"], r["name"], r["prices"]) for r in detail["remedies"]] == [
        (1, "Pulsatilla", [{"form": "PILL", "price_poisha": 14000}]),
        (2, "Nux vomica", [{"form": "PILL", "price_poisha": 11000}]),
        (3, "Carbo vegetabilis", [{"form": "PILL", "price_poisha": 13000}]),
    ]


def test_duplicate_remedy_in_illness_is_refused(manager):
    category = make_category(manager)
    illness = make_illness(manager, category["id"])
    remedy = make_remedy("Arsenicum album")

    resp = manager.put(
        f"{ILLNESSES_ADMIN}{illness['id']}/remedies/",
        {"remedy_ids": [str(remedy.id), str(remedy.id)]},
        format="json",
    )
    assert resp.status_code == 400
    assert error_code(resp) == "DUPLICATE_REMEDY"

    illness_obj = Illness.objects.get(pk=illness["id"])
    IllnessRemedy.objects.create(illness=illness_obj, remedy=remedy, rank=1)
    with pytest.raises(IntegrityError):
        IllnessRemedy.objects.create(illness=illness_obj, remedy=remedy, rank=2)


def test_inactive_illnesses_categories_and_remedies_are_hidden_from_public(manager):
    active_cat = make_category(manager, name="Respiratory", is_active=True)
    inactive_cat = make_category(manager, name="Hidden Group", is_active=False)
    empty_cat = make_category(manager, name="Empty Group", is_active=True)

    active_illness = make_illness(manager, active_cat["id"], name="Dry cough", status="ACTIVE")
    inactive_illness = make_illness(
        manager, active_cat["id"], name="Hidden cough", status="INACTIVE"
    )
    hidden_cat_illness = make_illness(
        manager, inactive_cat["id"], name="Cough in hidden cat", status="ACTIVE"
    )
    make_illness(manager, empty_cat["id"], name="Draft only", status="INACTIVE")

    active_rem = make_remedy("Bryonia alba", status=Remedy.Status.ACTIVE)
    draft_rem = make_remedy("Drosera", status=Remedy.Status.DRAFT)
    archived_rem = make_remedy("Spongia", status=Remedy.Status.ARCHIVED)

    manager.put(
        f"{ILLNESSES_ADMIN}{active_illness['id']}/remedies/",
        {"remedy_ids": [str(active_rem.id), str(draft_rem.id), str(archived_rem.id)]},
        format="json",
    )

    visitor = APIClient()
    categories = visitor.get(CATEGORIES_PUBLIC).json()
    assert [c["slug"] for c in categories] == [active_cat["slug"]]
    assert [i["slug"] for i in categories[0]["illnesses"]] == [active_illness["slug"]]
    # Only the active remedy counts; the draft and archived ones are hidden.
    assert categories[0]["illnesses"][0]["remedy_count"] == 1
    assert categories[0]["illnesses"][0]["other_name"] == "অ্যাসিডিটি"
    in_bangla = visitor.get(CATEGORIES_PUBLIC, headers={"Accept-Language": "bn"}).json()
    assert in_bangla[0]["illnesses"][0]["name"] == "অ্যাসিডিটি"
    assert in_bangla[0]["illnesses"][0]["other_name"] == "Dry cough"

    assert visitor.get(f"{ILLNESSES_PUBLIC}{inactive_illness['slug']}/").status_code == 404
    assert visitor.get(f"{ILLNESSES_PUBLIC}{hidden_cat_illness['slug']}/").status_code == 404

    detail = visitor.get(f"{ILLNESSES_PUBLIC}{active_illness['slug']}/").json()
    assert [r["name"] for r in detail["remedies"]] == ["Bryonia alba"]
    assert IllnessCategory.objects.count() == 3
