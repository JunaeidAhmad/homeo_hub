"""The remedy catalogue: who may edit it, what patients see, and picture uploads."""

from io import BytesIO
from typing import Any

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from PIL import Image
from rest_framework.test import APIClient

from apps.remedies.models import Remedy
from apps.staff import services as staff
from apps.staff.roles import Role
from tests.auth_helpers import PASSWORD, WEB, error_code

pytestmark = pytest.mark.django_db

PUBLIC = "/api/v1/remedies/"
ADMIN = "/api/v1/admin/remedies/"


@pytest.fixture(autouse=True)
def media_folder(settings, tmp_path):
    settings.MEDIA_ROOT = tmp_path


def staff_client(role: Role) -> APIClient:
    staff.seed_roles()
    staff.create_staff(username=role, full_name=role, password=PASSWORD, roles=[role])
    client = APIClient()
    token = client.post(
        "/api/v1/auth/staff/login/",
        {"username": role, "password": PASSWORD},
        format="json",
        headers=WEB,
    ).json()["access_token"]
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
    return client


@pytest.fixture
def editor() -> APIClient:
    return staff_client(Role.REMEDY_MANAGER)


def remedy_data(**changes) -> dict:
    return {
        "name": "Arsenicum album",
        "description_en": "A classical remedy.",
        "indication_en": "Burning, watery stools.",
        "advice_do_en": "Take on a clean tongue\n\nRest",
        "advice_dont_en": "Coffee near the dose",
        **changes,
    }


def create(client: APIClient, **changes) -> dict:
    response = client.post(ADMIN, remedy_data(**changes), format="json")
    assert response.status_code == 201, response.content
    return response.json()


def picture(kind: str = "PNG", size=(2000, 1000), name: str = "photo.png") -> SimpleUploadedFile:
    buffer = BytesIO()
    Image.new("RGB", size, "green").save(buffer, format=kind)
    return SimpleUploadedFile(name, buffer.getvalue())


def upload(client: APIClient, remedy_id: str, file) -> Any:
    return client.put(f"{ADMIN}{remedy_id}/picture/", {"picture": file}, format="multipart")


# --- permissions -----------------------------------------------------------------


@pytest.mark.parametrize("role", [Role.SUPPORT, Role.ILLNESS_MANAGER, Role.FINANCE])
def test_staff_without_the_permission_cannot_touch_remedies(editor, role):
    remedy = create(editor)
    other = staff_client(role)
    url = f"{ADMIN}{remedy['id']}/"

    responses = [
        other.get(ADMIN),
        other.get(url),
        other.post(ADMIN, remedy_data(name="Nux vomica"), format="json"),
        other.patch(url, {"status": "ACTIVE"}, format="json"),
        upload(other, remedy["id"], picture()),
        other.delete(f"{url}picture/"),
    ]

    assert [r.status_code for r in responses] == [403] * 6
    assert Remedy.objects.get().status == "DRAFT"


def test_visitors_cannot_use_the_admin_endpoints():
    assert APIClient().post(ADMIN, remedy_data(), format="json").status_code == 401


# --- only active remedies are public ----------------------------------------------


@pytest.mark.parametrize("hidden", ["DRAFT", "ARCHIVED"])
def test_only_active_remedies_are_public(editor, hidden):
    create(editor, status="ACTIVE")
    create(editor, name="Nux vomica", status=hidden)
    visitor = APIClient()

    listed = visitor.get(PUBLIC).json()["results"]

    assert [r["slug"] for r in listed] == ["arsenicum-album"]
    assert visitor.get(f"{PUBLIC}arsenicum-album/").status_code == 200
    assert visitor.get(f"{PUBLIC}nux-vomica/").status_code == 404
    assert visitor.get(PUBLIC, {"q": "Nux vomica"}).json()["count"] == 0


def test_the_public_page_gets_one_language_with_english_as_fallback(editor):
    create(editor, status="ACTIVE", indication_bn="জ্বালাসহ পাতলা পায়খানা।")

    page = APIClient().get(f"{PUBLIC}arsenicum-album/", headers={"Accept-Language": "bn"}).json()

    assert page["indication"] == "জ্বালাসহ পাতলা পায়খানা।"
    assert page["description"] == "A classical remedy."
    assert page["advice_do"] == ["Take on a clean tongue", "Rest"]
    assert page["picture_url"] is None


# --- names, addresses and required text --------------------------------------------


def test_names_and_addresses_are_unique(editor):
    create(editor)
    same_name = editor.post(ADMIN, remedy_data(name="ARSENICUM ALBUM"), format="json")
    same_slug = editor.post(
        ADMIN, remedy_data(name="Nux vomica", slug="arsenicum-album"), format="json"
    )

    assert error_code(same_name) == "REMEDY_NAME_TAKEN"
    assert error_code(same_slug) == "REMEDY_SLUG_TAKEN"


def test_renaming_keeps_the_web_address(editor):
    remedy = create(editor)

    changed = editor.patch(
        f"{ADMIN}{remedy['id']}/", {"name": "Arsenicum", "slug": ""}, format="json"
    ).json()

    assert changed["slug"] == "arsenicum-album"


def test_english_is_required_and_bangla_is_not(editor):
    response = editor.post(ADMIN, remedy_data(description_en=""), format="json")

    assert response.status_code == 400
    assert list(response.json()["error"]["details"]) == ["description_en"]


# --- pictures ---------------------------------------------------------------------


def test_a_picture_is_stored_small_as_webp_and_can_be_replaced_or_removed(editor, tmp_path):
    remedy = create(editor)

    first = upload(editor, remedy["id"], picture())
    assert first.status_code == 200, first.content
    assert first.json()["picture_url"].endswith(".webp")
    stored = list((tmp_path / "remedies").iterdir())
    with Image.open(stored[0]) as saved:
        assert saved.format == "WEBP"
        assert saved.size == (1200, 600)

    editor.delete(f"{ADMIN}{remedy['id']}/picture/")
    assert Remedy.objects.get().picture.name == ""


@pytest.mark.parametrize(
    ("file", "code"),
    [
        (lambda: SimpleUploadedFile("x.png", b"<script>alert(1)</script>"), "not_an_image"),
        (lambda: picture(kind="GIF", name="x.png"), "unsupported_type"),
        (lambda: SimpleUploadedFile("x.jpg", b"0" * (5 * 1024 * 1024 + 1)), "file_too_large"),
        (lambda: picture(size=(8000, 6000)), "image_too_big"),
    ],
)
def test_unsafe_pictures_are_refused(editor, tmp_path, file, code):
    remedy = create(editor)

    response = upload(editor, remedy["id"], file())

    assert response.status_code == 400
    assert response.json()["error"]["details"]["picture"][0]["code"] == code
    assert not (tmp_path / "remedies").exists()


def test_uploads_are_refused_when_no_storage_is_set_up(editor, settings):
    settings.UPLOADS_ENABLED = False
    remedy = create(editor)

    assert error_code(upload(editor, remedy["id"], picture())) == "STORAGE_NOT_CONFIGURED"


def test_bangla_is_found_whichever_way_its_letters_were_typed(editor):
    one_code_point, letter_and_dot = chr(0x09DF), chr(0x09AF) + chr(0x09BC)
    create(editor, status="ACTIVE", name_bn=f"আর্সেনিকাম অ্যালবা{one_code_point}")

    found = APIClient().get(PUBLIC, {"q": f"অ্যালবা{letter_and_dot}"}).json()

    assert found["results"][0]["name_bn"].endswith(letter_and_dot)
