"""Sign up with a phone number, then verify it with the code sent by text."""

from datetime import date

import pytest
from django.utils import timezone

from apps.patients.models import Patient
from tests.auth_helpers import (
    COOKIE,
    PASSWORD,
    PHONE,
    RESEND,
    SIGNUP,
    error_code,
    last_code,
    log_in,
    me,
    sign_up,
    signup_data,
    verified_patient,
    verify,
    wrong,
)

pytestmark = pytest.mark.django_db


def test_signing_up_texts_a_code_to_the_normalised_number(api, location, sms_outbox):
    response = sign_up(api, location)

    assert response.status_code == 201
    body = response.json()
    assert body["phone"] == PHONE
    assert body["expires_in"] == 300
    assert body["resend_after"] == 60
    assert [message.to for message in sms_outbox] == [PHONE]
    assert len(last_code()) == 6
    assert COOKIE not in response.cookies  # not signed in until verified


def test_the_password_is_stored_hashed(api, location):
    sign_up(api, location)

    patient = Patient.objects.get(phone=PHONE)
    assert PASSWORD not in patient.password


def test_the_right_code_verifies_the_phone_and_signs_in(api, location):
    session = verified_patient(api, location)

    assert session["user_type"] == "patient"
    assert session["expires_in"] == 900  # short-lived access token
    profile = me(api, session["access_token"]).json()
    assert profile["phone"] == PHONE
    assert profile["full_name"] == "Rahima Akhter"
    assert profile["gender"] == "FEMALE"
    assert profile["phone_verified"] is True
    assert profile["location"]["display_name"] == "Kapasia, Gazipur, Dhaka"


def test_the_refresh_token_is_only_in_a_locked_down_cookie(api, location):
    started = sign_up(api, location).json()

    response = verify(api, started["verification_id"], last_code())

    cookie = response.cookies[COOKIE]
    assert cookie["httponly"] is True
    assert cookie["samesite"] == "Strict"
    assert cookie["path"] == "/api/v1/auth/"
    assert int(cookie["max-age"]) == 30 * 24 * 60 * 60
    assert cookie.value not in response.content.decode()


def test_age_is_kept_as_an_approximate_date_of_birth(api, location):
    session = verified_patient(api, location, age=34)

    profile = me(api, session["access_token"]).json()
    today = timezone.localdate()
    born = date.fromisoformat(profile["date_of_birth"])
    assert born.year == today.year - 34
    assert profile["age"] == 34


@pytest.mark.parametrize(("language", "script"), [("en", "code"), ("bn", "কোড")])
def test_the_text_and_the_account_use_the_visitors_language(
    api, location, sms_outbox, language, script
):
    session = None
    started = sign_up(api, location, headers={"Accept-Language": language}).json()
    assert script in sms_outbox[-1].message.lower()
    session = verify(api, started["verification_id"], last_code()).json()

    assert me(api, session["access_token"]).json()["preferred_language"] == language


# --- wrong, old and reused codes ---------------------------------------------


def test_a_wrong_code_is_refused_and_says_how_many_tries_are_left(api, location):
    started = sign_up(api, location).json()

    response = verify(api, started["verification_id"], wrong(last_code()))

    assert response.status_code == 400
    assert error_code(response) == "OTP_INVALID"
    assert response.json()["error"]["details"]["attempts_left"] == 4
    assert COOKIE not in response.cookies
    assert verify(api, started["verification_id"], last_code()).status_code == 200


def test_after_five_wrong_tries_even_the_right_code_is_refused(api, location):
    started = sign_up(api, location).json()
    code = last_code()
    for _ in range(5):
        verify(api, started["verification_id"], wrong(code))

    response = verify(api, started["verification_id"], code)

    assert response.status_code == 400
    assert error_code(response) == "OTP_TOO_MANY_ATTEMPTS"


def test_a_code_stops_working_after_five_minutes(api, location, clock):
    started = sign_up(api, location).json()
    clock.advance(minutes=5, seconds=1)

    response = verify(api, started["verification_id"], last_code())

    assert error_code(response) == "OTP_EXPIRED"


def test_a_code_works_only_once(api, location):
    started = sign_up(api, location).json()
    code = last_code()
    assert verify(api, started["verification_id"], code).status_code == 200

    assert error_code(verify(api, started["verification_id"], code)) == "OTP_EXPIRED"


def test_a_code_typed_in_bangla_digits_is_accepted(api, location):
    started = sign_up(api, location).json()
    bangla = last_code().translate(str.maketrans("0123456789", "০১২৩৪৫৬৭৮৯"))

    assert verify(api, started["verification_id"], bangla).status_code == 200


@pytest.mark.parametrize("verification_id", ["", "not-a-uuid", "0" * 32])
def test_an_unknown_verification_is_refused_cleanly(api, location, verification_id):
    assert verify(api, verification_id, "123456").status_code == 400


# --- resending and rate limits -------------------------------------------------


def test_resending_replaces_the_old_code(api, location, sms_outbox):
    started = sign_up(api, location).json()
    first = last_code()

    response = api.post(RESEND, {"verification_id": started["verification_id"]}, format="json")

    assert response.status_code == 200
    assert len(sms_outbox) == 2
    second = last_code()
    if second != first:
        assert error_code(verify(api, started["verification_id"], first)) == "OTP_INVALID"
    assert verify(api, started["verification_id"], second).status_code == 200


def test_a_number_can_be_texted_only_three_times_in_fifteen_minutes(
    api, location, clock, sms_outbox
):
    started = sign_up(api, location).json()
    for _ in range(2):
        api.post(RESEND, {"verification_id": started["verification_id"]}, format="json")

    refused = api.post(RESEND, {"verification_id": started["verification_id"]}, format="json")
    also_refused = sign_up(api, location)  # signing up again does not get around it

    assert refused.status_code == also_refused.status_code == 429
    assert error_code(refused) == "RATE_LIMITED"
    assert 0 < refused.json()["error"]["details"]["retry_after"] <= 15 * 60
    assert int(refused["Retry-After"]) > 0
    assert len(sms_outbox) == 3

    clock.advance(minutes=15, seconds=1)
    assert sign_up(api, location).status_code == 201


def test_a_refused_sign_up_changes_nothing(api, location):
    started = sign_up(api, location).json()
    for _ in range(2):
        api.post(RESEND, {"verification_id": started["verification_id"]}, format="json")

    sign_up(api, location, full_name="Someone Else")

    assert Patient.objects.get(phone=PHONE).full_name == "Rahima Akhter"
    assert verify(api, started["verification_id"], last_code()).status_code == 200


def test_one_address_cannot_text_many_numbers(api, location, settings):
    for n in range(20):
        assert sign_up(api, location, phone=f"017000000{n:02d}").status_code == 201

    assert sign_up(api, location, phone="01700000099").status_code == 429


def test_the_service_has_an_overall_hourly_cap_on_texts(api, location, settings):
    settings.OTP_MAX_SENDS_PER_HOUR = 2
    sign_up(api, location, phone="01700000001")
    sign_up(api, location, phone="01700000002")

    assert sign_up(api, location, phone="01700000003").status_code == 429


def test_signing_up_says_so_when_texts_cannot_be_sent(api, location, settings):
    settings.SMS_PROVIDER = "apps.accounts.sms.UnconfiguredSmsProvider"

    response = sign_up(api, location)

    assert response.status_code == 503
    assert error_code(response) == "SMS_UNAVAILABLE"


# --- one account per number ---------------------------------------------------


def test_a_verified_number_cannot_sign_up_again(api, location):
    verified_patient(api, location)

    response = sign_up(api, location, phone="+880 1712-345678", password="another-pass-99")

    assert response.status_code == 409
    assert error_code(response) == "PHONE_TAKEN"
    assert Patient.objects.count() == 1


def test_an_unverified_number_can_sign_up_again_and_the_old_code_dies(api, location):
    first = sign_up(api, location, full_name="Typo Name").json()
    first_code = last_code()

    second = sign_up(api, location, password="second-choice-77").json()

    assert Patient.objects.count() == 1
    assert verify(api, first["verification_id"], first_code).status_code == 400
    assert verify(api, second["verification_id"], last_code()).status_code == 200
    assert log_in(api, password="second-choice-77").status_code == 200


# --- validation ----------------------------------------------------------------


@pytest.mark.parametrize(
    ("field", "value", "code"),
    [
        ("phone", "12345", "INVALID_PHONE"),
        ("password", "short", "password_too_short"),
        ("password", "password123", "password_too_common"),
        ("full_name", "", "blank"),
        ("gender", "ROBOT", "invalid_choice"),
        ("age", 0, "min_value"),
        ("age", 150, "max_value"),
        ("location_id", "00000000-0000-0000-0000-000000000000", "does_not_exist"),
    ],
)
def test_bad_input_names_the_field_and_the_problem(api, location, sms_outbox, field, value, code):
    response = api.post(SIGNUP, signup_data(location, **{field: value}), format="json")

    assert response.status_code == 400
    error = response.json()["error"]
    assert error["code"] == "VALIDATION_ERROR"
    assert code in [problem["code"] for problem in error["details"][field]]
    assert error["request_id"]
    assert sms_outbox == []
    assert Patient.objects.count() == 0
