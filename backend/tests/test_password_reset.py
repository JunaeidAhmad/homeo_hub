"""Forgotten password: prove the phone again, then choose a new one."""

import pytest
from rest_framework.test import APIClient

from tests.auth_helpers import (
    FORGOT,
    PASSWORD,
    RESET,
    error_code,
    last_code,
    log_in,
    me,
    refresh,
    sign_up,
    verified_patient,
    verify,
    wrong,
)

pytestmark = pytest.mark.django_db

NEW_PASSWORD = "mango-canoe-71-lantern"


class FailingSmsProvider:
    def send(self, to: str, message: str) -> None:
        raise ConnectionError("gateway down")


def forgot(client, phone="01712345678"):
    return client.post(FORGOT, {"phone": phone}, format="json")


def reset(client, verification_id, code, password=NEW_PASSWORD):
    return client.post(
        RESET,
        {"verification_id": verification_id, "code": code, "new_password": password},
        format="json",
    )


@pytest.fixture
def signed_in(location):
    client = APIClient()
    session = verified_patient(client, location)
    return client, session["access_token"]


def test_a_new_password_replaces_the_old_one_and_signs_out_everywhere(api, signed_in):
    device, access = signed_in
    started = forgot(api).json()

    response = reset(api, started["verification_id"], last_code())

    assert response.status_code == 204
    assert log_in(api, password=PASSWORD).status_code == 401
    assert log_in(api, password=NEW_PASSWORD).status_code == 200
    assert me(device, access).status_code == 401
    assert refresh(device).status_code == 401


def test_an_unknown_number_gets_the_same_answer_but_no_text(api, signed_in, sms_outbox):
    sms_outbox.clear()

    known = forgot(api)
    unknown = forgot(api, "01899999999")

    assert known.status_code == unknown.status_code == 200
    assert set(known.json()) == set(unknown.json())
    assert [message.to for message in sms_outbox] == ["+8801712345678"]
    attempt = reset(api, unknown.json()["verification_id"], "123456")
    assert error_code(attempt) == "OTP_INVALID"


def test_the_limit_on_texts_is_the_same_for_unknown_numbers(api, signed_in, clock):
    clock.advance(minutes=16)
    known = [forgot(api).status_code for _ in range(4)]
    unknown = [forgot(api, "01899999999").status_code for _ in range(4)]

    assert known == unknown == [200, 200, 200, 429]


def test_a_wrong_code_changes_nothing(api, signed_in):
    started = forgot(api).json()

    response = reset(api, started["verification_id"], wrong(last_code()))

    assert error_code(response) == "OTP_INVALID"
    assert log_in(api, password=PASSWORD).status_code == 200


def test_a_weak_password_is_refused_without_using_up_the_code(api, signed_in):
    started = forgot(api).json()
    code = last_code()

    weak = reset(api, started["verification_id"], code, password="12345678")

    assert weak.status_code == 400
    assert "new_password" in weak.json()["error"]["details"]
    assert reset(api, started["verification_id"], code).status_code == 204


def test_a_sign_up_code_cannot_reset_a_password(api, location):
    started = sign_up(api, location).json()

    response = reset(api, started["verification_id"], last_code())

    assert response.status_code == 400


def test_a_reset_code_cannot_be_used_to_sign_in(api, signed_in):
    started = forgot(api).json()

    response = verify(api, started["verification_id"], last_code())

    assert response.status_code == 400


def test_resetting_also_verifies_the_phone(api, location):
    sign_up(api, location)
    started = forgot(api).json()

    reset(api, started["verification_id"], last_code())

    assert log_in(api, password=NEW_PASSWORD).status_code == 200


def test_forgot_password_validates_the_number(api):
    response = forgot(api, "abc")

    assert response.status_code == 400
    assert response.json()["error"]["details"]["phone"][0]["code"] == "INVALID_PHONE"


def test_a_wrong_code_reveals_nothing_about_the_account(api, signed_in):
    started = forgot(api).json()
    unknown = forgot(api, "01899999999").json()
    like_the_name = "rahimaakhter"  # refused for this account only

    real = reset(api, started["verification_id"], wrong(last_code()), password=like_the_name)
    decoy = reset(api, unknown["verification_id"], "123456", password=like_the_name)

    assert error_code(real) == error_code(decoy) == "OTP_INVALID"


def test_a_password_too_like_the_name_is_refused_but_the_code_stays_usable(api, signed_in):
    started = forgot(api).json()
    code = last_code()

    refused = reset(api, started["verification_id"], code, password="rahimaakhter")

    problems = refused.json()["error"]["details"]["new_password"]
    assert [p["code"] for p in problems] == ["password_too_similar"]
    assert log_in(api, password=PASSWORD).status_code == 200
    assert reset(api, started["verification_id"], code).status_code == 204


def test_when_texts_are_not_set_up_both_kinds_of_number_hear_the_same(api, signed_in, settings):
    settings.SMS_PROVIDER = "apps.accounts.sms.UnconfiguredSmsProvider"

    known = forgot(api)
    unknown = forgot(api, "01899999999")

    assert known.status_code == unknown.status_code == 503
    assert error_code(known) == error_code(unknown) == "SMS_UNAVAILABLE"


def test_a_failing_text_gateway_does_not_reveal_which_numbers_exist(api, signed_in, settings):
    settings.SMS_PROVIDER = "tests.test_password_reset.FailingSmsProvider"

    known = forgot(api)
    unknown = forgot(api, "01899999999")

    assert known.status_code == unknown.status_code == 200
