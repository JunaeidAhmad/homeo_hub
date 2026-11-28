"""Staff sign-in and role-based access to the admin API."""

import pytest
from django.contrib.auth.models import User
from django.urls import URLPattern, URLResolver, get_resolver
from rest_framework.test import APIClient

from apps.staff import services
from apps.staff.permissions import AdminView
from apps.staff.roles import ROLE_PERMISSIONS, Perm, Role
from tests.auth_helpers import PASSWORD, WEB, error_code, staff_phone, verified_patient

pytestmark = pytest.mark.django_db

LOGIN = "/api/v1/auth/staff/login/"
REFRESH = "/api/v1/auth/staff/refresh/"
ME = "/api/v1/admin/me/"
ROLES = "/api/v1/admin/roles/"
STAFF = "/api/v1/admin/staff/"


@pytest.fixture(autouse=True)
def roles(db):
    services.seed_roles()


def make(username: str, *roles: Role) -> User:
    return services.create_staff(
        phone=staff_phone(username),
        full_name=username.title(),
        password=PASSWORD,
        roles=list(roles),
    )


def signed_in(user: User) -> APIClient:
    client = APIClient()
    response = client.post(
        LOGIN, {"phone": user.username, "password": PASSWORD}, format="json", headers=WEB
    )
    assert response.status_code == 200, response.content
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {response.json()['access_token']}")
    return client


def new_staff(**changes) -> dict:
    return {
        "phone": staff_phone("nila"),
        "full_name": "Nila",
        "password": PASSWORD,
        "roles": ["finance"],
        **changes,
    }


# --- the API refuses, whatever the screen shows -----------------------------------


@pytest.mark.parametrize("role", [role for role in Role if role != Role.SUPER_ADMIN])
def test_a_role_without_the_permission_is_refused_by_the_api(role):
    target = make("target", Role.SUPPORT)
    client = signed_in(make("worker", role))

    attempts = [
        client.get(STAFF),
        client.get(ROLES),
        client.get(f"{STAFF}{target.pk}/"),
        client.post(STAFF, new_staff(), format="json"),
        client.patch(f"{STAFF}{target.pk}/", {"roles": ["super_admin"]}, format="json"),
    ]

    assert [response.status_code for response in attempts] == [403] * 5
    assert not User.objects.filter(username=staff_phone("nila")).exists()
    assert services.roles_of(User.objects.get(pk=target.pk)) == ["support"]


def test_anonymous_visitors_and_patients_get_nowhere(location):
    assert APIClient().get(STAFF).status_code == 401
    patient = APIClient()
    token = verified_patient(patient, location)["access_token"]
    patient.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")

    assert patient.get(STAFF).status_code == 403
    assert patient.get(ME).status_code == 403


def admin_views(patterns=None, prefix=""):
    for pattern in patterns if patterns is not None else get_resolver().url_patterns:
        route = prefix + str(pattern.pattern)
        if isinstance(pattern, URLResolver):
            yield from admin_views(pattern.url_patterns, route)
        elif isinstance(pattern, URLPattern) and route.startswith("api/v1/admin/"):
            yield route, pattern.callback.view_class  # type: ignore[attr-defined]


def test_every_admin_endpoint_declares_the_permission_each_method_needs():
    found = list(admin_views())

    assert found
    for route, view in found:
        assert issubclass(view, AdminView), route
        methods = {m.upper() for m in view.http_method_names if m != "options" and hasattr(view, m)}
        assert methods - {"HEAD"} <= set(view.required_permissions), route


# --- roles ------------------------------------------------------------------------


def test_each_default_role_is_seeded_with_its_permissions():
    services.seed_roles()  # repeatable

    for role, perms in ROLE_PERMISSIONS.items():
        user = make(f"u-{role}", role)
        assert services.permissions_of(user) == sorted(p.value for p in perms), role


def test_staff_see_who_they_are_and_what_they_may_do():
    me = signed_in(make("fin", Role.FINANCE)).get(ME).json()

    assert me["roles"] == ["finance"]
    assert me["permissions"] == sorted([Perm.MANAGE_PAYMENTS, Perm.VIEW_PAYMENTS])


# --- the super admin manages staff -------------------------------------------------


def test_a_super_admin_creates_staff_changes_roles_and_deactivates():
    boss = signed_in(make("boss", Role.SUPER_ADMIN))

    created = boss.post(STAFF, new_staff(), format="json")
    assert created.status_code == 201
    url = f"{STAFF}{created.json()['id']}/"
    nila = User.objects.get(username=staff_phone("nila"))
    nila_client = signed_in(nila)
    assert nila_client.get(STAFF).status_code == 403

    boss.patch(url, {"roles": ["super_admin"]}, format="json")
    assert nila_client.get(STAFF).status_code == 200  # takes effect at once

    assert boss.patch(url, {"is_active": False}, format="json").json()["is_active"] is False
    assert nila_client.get(ME).status_code == 401  # signed out everywhere
    assert nila_client.post(REFRESH, headers=WEB).status_code == 401
    again = APIClient().post(
        LOGIN, {"phone": staff_phone("nila"), "password": PASSWORD}, format="json", headers=WEB
    )
    assert error_code(again) == "INVALID_CREDENTIALS"


@pytest.mark.parametrize("change", [{"is_active": False}, {"roles": ["support"]}])
def test_a_super_admin_cannot_lock_themselves_out(change):
    me = make("boss", Role.SUPER_ADMIN)

    response = signed_in(me).patch(f"{STAFF}{me.pk}/", change, format="json")

    assert error_code(response) == "CANNOT_LOCK_YOURSELF_OUT"


def test_a_number_can_be_used_once_however_it_is_typed():
    boss = signed_in(make("boss", Role.SUPER_ADMIN))

    local = "0" + staff_phone("boss").removeprefix("+880")
    response = boss.post(STAFF, new_staff(phone=local), format="json")

    assert error_code(response) == "PHONE_TAKEN"


# --- sessions ---------------------------------------------------------------------


def test_a_staff_session_ends_twelve_hours_after_sign_in_however_busy(clock):
    client = signed_in(make("fin", Role.FINANCE))
    assert int(client.cookies["hh_staff_refresh"]["max-age"]) == 12 * 60 * 60

    clock.advance(hours=11, minutes=59)
    refreshed = client.post(REFRESH, headers=WEB)
    assert refreshed.status_code == 200
    assert int(refreshed.cookies["hh_staff_refresh"]["max-age"]) <= 60

    clock.advance(minutes=2)
    assert client.post(REFRESH, headers=WEB).status_code == 401


def test_staff_and_patient_sessions_stay_apart(location):
    client = APIClient()
    verified_patient(client, location)
    patient_cookie = client.cookies["hh_refresh"].value
    client.cookies["hh_staff_refresh"] = patient_cookie

    assert client.post(REFRESH, headers=WEB).status_code == 401  # not a staff token
    assert client.post("/api/v1/auth/refresh/", headers=WEB).status_code == 200


def test_django_admin_is_not_mounted_outside_local_development():
    assert APIClient().get("/django-admin/login/").status_code == 404
