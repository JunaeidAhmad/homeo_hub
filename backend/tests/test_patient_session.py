"""Signing in, staying signed in, and signing out."""

import jwt
import pytest
from rest_framework.test import APIClient

from apps.patients.models import Patient
from tests.auth_helpers import (
    COOKIE,
    LOGIN,
    LOGOUT,
    ME,
    PASSWORD,
    REFRESH,
    WEB,
    error_code,
    last_code,
    log_in,
    me,
    refresh,
    sign_up,
    verified_patient,
    verify,
)

pytestmark = pytest.mark.django_db


@pytest.fixture
def account(location):
    """A verified patient, signed out."""
    client = APIClient()
    verified_patient(client, location)
    return Patient.objects.get()


# --- sign in ------------------------------------------------------------------


@pytest.mark.parametrize("typed", ["01712345678", "+880 1712 345678", "০১৭১২৩৪৫৬৭৮"])
def test_signing_in_with_the_phone_and_password(api, account, typed):
    response = log_in(api, phone=typed)

    assert response.status_code == 200
    assert me(api, response.json()["access_token"]).status_code == 200
    assert response.cookies[COOKIE].value


def test_a_wrong_password_and_an_unknown_number_look_the_same(api, account):
    wrong_password = log_in(api, password="not-the-password")
    unknown_number = log_in(api, phone="01899999999")

    assert wrong_password.status_code == unknown_number.status_code == 401
    assert error_code(wrong_password) == error_code(unknown_number) == "INVALID_CREDENTIALS"
    assert wrong_password.json()["error"]["message"] == unknown_number.json()["error"]["message"]


def test_a_disabled_account_cannot_sign_in(api, account):
    Patient.objects.filter(pk=account.pk).update(is_active=False)

    assert error_code(log_in(api)) == "INVALID_CREDENTIALS"


def test_signing_in_before_verifying_sends_a_new_code_instead(api, location, sms_outbox):
    sign_up(api, location)

    response = log_in(api)

    assert response.status_code == 403
    error = response.json()["error"]
    assert error["code"] == "PHONE_NOT_VERIFIED"
    assert COOKIE not in response.cookies
    assert len(sms_outbox) == 2
    assert verify(api, error["details"]["verification_id"], last_code()).status_code == 200


def test_sign_in_is_limited_to_five_tries_a_minute_per_number(api, account):
    for _ in range(5):
        log_in(api, password="guess-guess-guess")

    blocked = log_in(api, password=PASSWORD)  # even the right one
    other_number = log_in(api, phone="01899999999")

    assert blocked.status_code == 429
    assert error_code(blocked) == "RATE_LIMITED"
    assert blocked.json()["error"]["details"]["retry_after"] > 0
    assert other_number.status_code == 401


def test_writing_the_number_differently_does_not_reset_the_limit(api, account):
    for typed in ["01712345678", "+8801712345678", "880 1712 345678", "1712345678", "01712-345678"]:
        log_in(api, phone=typed, password="guess-guess-guess")

    assert log_in(api, phone="০১৭১২৩৪৫৬৭৮").status_code == 429


def test_sending_the_number_as_a_json_number_does_not_escape_the_limit(api, account):
    for _ in range(5):
        log_in(api, phone=1712345678, password="guess-guess-guess")

    assert log_in(api, phone=1712345678, password=PASSWORD).status_code == 429
    assert log_in(api, password=PASSWORD).status_code == 429


def test_one_address_cannot_try_many_numbers(api, account):
    for n in range(30):
        log_in(api, phone=f"018000000{n:02d}")

    assert log_in(api, phone="01800000099").status_code == 429


@pytest.mark.parametrize("body", [{}, {"phone": "01712345678"}, {"phone": 5, "password": None}])
def test_an_incomplete_sign_in_is_a_validation_error(api, body):
    response = api.post(LOGIN, body, format="json", headers=WEB)

    assert response.status_code == 400
    assert error_code(response) == "VALIDATION_ERROR"


# --- staying signed in ---------------------------------------------------------


def test_refreshing_returns_a_new_access_token_and_rotates_the_cookie(api, account):
    log_in(api)
    old_cookie = api.cookies[COOKIE].value

    response = refresh(api)

    assert response.status_code == 200
    assert api.cookies[COOKIE].value != old_cookie
    assert me(api, response.json()["access_token"]).status_code == 200
    assert refresh(api).status_code == 200  # and the new one keeps working


def test_refresh_is_only_accepted_from_the_web_app(api, account):
    log_in(api)

    response = api.post(REFRESH)  # no X-Client header: a cross-site form cannot add it

    assert response.status_code == 403
    assert refresh(api).status_code == 200


def test_replaying_a_used_refresh_token_ends_the_whole_session(api, account, clock):
    log_in(api)
    stolen = api.cookies[COOKIE].value
    access = refresh(api).json()["access_token"]
    current = api.cookies[COOKIE].value
    clock.advance(seconds=30)

    thief = APIClient()
    thief.cookies[COOKIE] = stolen
    assert refresh(thief).status_code == 401

    owner = APIClient()
    owner.cookies[COOKIE] = current
    assert refresh(owner).status_code == 401
    assert me(api, access).status_code == 401


def test_two_tabs_refreshing_at_once_do_not_end_the_session(api, account):
    log_in(api)
    first_cookie = api.cookies[COOKIE].value
    assert refresh(api).status_code == 200

    second_tab = APIClient()
    second_tab.cookies[COOKIE] = first_cookie
    late = refresh(second_tab)

    assert late.status_code == 401
    assert error_code(late) == "REFRESH_IN_PROGRESS"
    assert COOKIE not in late.cookies  # must not wipe the cookie the first tab just set
    assert refresh(api).status_code == 200


def test_a_session_ends_after_thirty_days_unused(api, account, clock):
    log_in(api)
    clock.advance(days=30, minutes=1)

    response = refresh(api)

    assert response.status_code == 401
    assert error_code(response) == "SESSION_EXPIRED"
    assert response.cookies[COOKIE].value == ""  # cleared


@pytest.mark.parametrize("cookie", [None, "", "made-up-token"])
def test_refreshing_without_a_real_session_is_refused(api, cookie):
    if cookie is not None:
        api.cookies[COOKIE] = cookie

    assert refresh(api).status_code == 401


def test_a_disabled_account_cannot_refresh(api, account):
    log_in(api)
    Patient.objects.filter(pk=account.pk).update(is_active=False)

    assert refresh(api).status_code == 401


def test_an_access_token_expires_after_fifteen_minutes(api, account, clock):
    clock.advance(minutes=-16)
    old = log_in(api).json()["access_token"]
    clock.advance(minutes=16)

    response = me(api, old)

    assert response.status_code == 401
    assert error_code(response) == "NOT_AUTHENTICATED"


def test_a_forged_access_token_is_refused(api, account):
    real = log_in(api).json()["access_token"]
    claims = jwt.decode(real, options={"verify_signature": False})
    forged = jwt.encode(claims, "x" * 40, algorithm="HS256")

    assert me(api, forged).status_code == 401
    assert me(api, "not.a.token").status_code == 401


def test_the_profile_needs_a_signed_in_patient(api):
    response = api.get(ME)

    assert response.status_code == 401
    assert error_code(response) == "NOT_AUTHENTICATED"


# --- sign out -----------------------------------------------------------------


def test_signing_out_ends_this_session_at_once(api, account):
    access = log_in(api).json()["access_token"]
    cookie = api.cookies[COOKIE].value

    response = api.post(LOGOUT, headers=WEB)

    assert response.status_code == 204
    assert response.cookies[COOKIE].value == ""
    assert me(api, access).status_code == 401
    replay = APIClient()
    replay.cookies[COOKIE] = cookie
    assert refresh(replay).status_code == 401


def test_signing_out_leaves_other_devices_signed_in(api, account):
    phone, laptop = APIClient(), APIClient()
    log_in(phone)
    laptop_access = log_in(laptop).json()["access_token"]

    phone.post(LOGOUT, headers=WEB)

    assert me(laptop, laptop_access).status_code == 200
    assert refresh(laptop).status_code == 200


def test_signing_out_twice_or_without_a_session_is_harmless(api):
    assert api.post(LOGOUT, headers=WEB).status_code == 204
    assert api.post(LOGOUT, headers=WEB).status_code == 204


def test_sign_out_is_only_accepted_from_the_web_app(api, account):
    log_in(api)

    assert api.post(LOGOUT).status_code == 403
    assert refresh(api).status_code == 200
