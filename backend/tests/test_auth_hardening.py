"""Attacks the sign-in flows have to withstand."""

import pytest
from rest_framework.test import APIClient

from tests.auth_helpers import (
    FORGOT,
    LOGIN,
    PASSWORD,
    PHONE,
    RESEND,
    RESET,
    SIGNUP,
    VERIFY,
    WEB,
    error_code,
    last_code,
    log_in,
    sign_up,
    verified_patient,
    verify,
)

pytestmark = pytest.mark.django_db

NEW_PASSWORD = "mango-canoe-71-lantern"


def resend(client, verification_id):
    return client.post(RESEND, {"verification_id": verification_id}, format="json")


def forgot(client, phone="01712345678"):
    return client.post(FORGOT, {"phone": phone}, format="json")


# --- someone else started a sign-up with the victim's number --------------------


def test_resetting_the_password_kills_every_earlier_code_for_the_number(api, location, clock):
    attacker = APIClient()
    theirs = sign_up(attacker, location).json()["verification_id"]
    owners = forgot(api).json()["verification_id"]
    response = api.post(
        RESET,
        {"verification_id": owners, "code": last_code(), "new_password": NEW_PASSWORD},
        format="json",
    )
    assert response.status_code == 204
    clock.advance(minutes=16)

    assert error_code(resend(attacker, theirs)) == "OTP_EXPIRED"
    assert error_code(verify(attacker, theirs, "123456")) == "OTP_EXPIRED"


def test_verifying_closes_every_other_code_for_the_number(api, location):
    pending_reset = forgot(api).json()["verification_id"]  # no account yet
    verified_patient(api, location)

    assert error_code(resend(api, pending_reset)) == "OTP_EXPIRED"


def test_a_verification_cannot_be_kept_alive_by_resending(api, location, clock):
    started = sign_up(api, location).json()["verification_id"]
    clock.advance(minutes=20)
    assert resend(api, started).status_code == 200
    clock.advance(minutes=11)  # 31 minutes since it began

    assert error_code(resend(api, started)) == "OTP_EXPIRED"


# --- finding out which numbers have accounts -------------------------------------


class FailingSmsProvider:
    def send(self, to: str, message: str) -> None:
        raise ConnectionError("gateway down")


def test_resending_a_reset_code_does_not_reveal_accounts_when_texts_fail(
    api, location, settings, clock
):
    verified_patient(api, location)
    clock.advance(minutes=16)
    known = forgot(api).json()["verification_id"]
    unknown = forgot(api, "01899999999").json()["verification_id"]
    settings.SMS_PROVIDER = "tests.test_auth_hardening.FailingSmsProvider"

    assert resend(api, known).status_code == resend(api, unknown).status_code == 200


def test_the_hourly_cap_refuses_known_and_unknown_numbers_alike(api, location, settings, clock):
    verified_patient(api, location)
    clock.advance(minutes=16)
    settings.OTP_MAX_SENDS_PER_HOUR = 1  # already used by the sign-up

    assert forgot(api).status_code == forgot(api, "01899999999").status_code == 429


# --- another website posting to us ---------------------------------------------


@pytest.mark.parametrize("url", [LOGIN, VERIFY])
def test_endpoints_that_set_the_session_cookie_need_the_web_header(api, location, url):
    response = api.post(url, {"phone": PHONE, "password": PASSWORD}, format="json")

    assert response.status_code == 403
    assert "hh_refresh" not in response.cookies


def test_a_cross_site_form_post_cannot_sign_anyone_in(api, location):
    verified_patient(APIClient(), location)

    response = api.post(
        LOGIN,
        f"phone=01712345678&password={PASSWORD}",
        content_type="application/x-www-form-urlencoded",
        headers={**WEB, "Origin": "https://evil.example"},
    )

    assert response.status_code == 415
    assert "hh_refresh" not in response.cookies


# --- hostile input never becomes a server error ----------------------------------


@pytest.mark.parametrize(
    "body",
    [
        '{"gender": "\\ud800"}',  # half of a surrogate pair
        '{"phone": "\\ud800", "password": "x"}',
        '{"\\udfff": 1}',
        "[" * 100_000 + "]" * 100_000,  # absurdly deep
        '{"phone": ' + "[" * 60 + "]" * 60 + "}",
        "{not json",
    ],
)
@pytest.mark.parametrize("url", [SIGNUP, LOGIN, FORGOT])
def test_unreadable_bodies_are_refused_cleanly(api, url, body):
    response = api.post(url, body, content_type="application/json", headers=WEB)

    assert response.status_code == 400
    assert error_code(response) == "PARSE_ERROR"


def test_unknown_addresses_answer_in_the_error_format(api):
    response = api.get("/api/v1/nothing-here/")

    assert response.status_code == 404
    assert error_code(response) == "NOT_FOUND"


# --- per-address limits cannot be dodged -----------------------------------------


def attempt(client, n: int, **headers):
    return client.post(
        LOGIN,
        {"phone": f"018{n:08d}", "password": "guess-guess-guess"},
        format="json",
        headers={**WEB, **headers},
    )


def test_inventing_forwarded_addresses_does_not_reset_the_limit(api, settings):
    for n in range(30):
        attempt(api, n, **{"X-Forwarded-For": f"10.9.{n}.1, 203.0.113.7"})

    blocked = attempt(api, 99, **{"X-Forwarded-For": "10.9.99.1, 203.0.113.7"})

    assert blocked.status_code == 429


def test_the_web_apps_proxy_tells_visitors_apart(api, settings):
    settings.PROXY_SHARED_SECRET = "proxy-secret"
    first = {"X-Proxy-Secret": "proxy-secret", "X-Client-Address": "198.51.100.1"}
    for n in range(30):
        attempt(api, n, **first)

    assert attempt(api, 97, **first).status_code == 429
    second = {**first, "X-Client-Address": "198.51.100.2"}
    assert attempt(api, 98, **second).status_code == 401


def test_a_visitor_address_without_the_proxy_secret_is_ignored(api, settings):
    settings.PROXY_SHARED_SECRET = "proxy-secret"
    for n in range(30):
        attempt(api, n, **{"X-Client-Address": f"198.51.100.{n}", "X-Proxy-Secret": "wrong"})

    assert attempt(api, 99, **{"X-Client-Address": "198.51.100.200"}).status_code == 429


def test_sign_up_and_login_still_work_with_the_web_header(api, location):
    verified_patient(api, location)

    assert log_in(api).status_code == 200
