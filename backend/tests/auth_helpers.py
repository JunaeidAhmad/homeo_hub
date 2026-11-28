"""Shared steps for the patient auth tests: all through the public HTTP API."""

import re
import zlib

from rest_framework.test import APIClient

from apps.accounts.sms import MemorySmsProvider

SIGNUP = "/api/v1/auth/patient/signup/"
LOGIN = "/api/v1/auth/patient/login/"
VERIFY = "/api/v1/auth/otp/verify/"
RESEND = "/api/v1/auth/otp/resend/"
REFRESH = "/api/v1/auth/refresh/"
LOGOUT = "/api/v1/auth/logout/"
FORGOT = "/api/v1/auth/password/forgot/"
RESET = "/api/v1/auth/password/reset/"
ME = "/api/v1/me/"

PHONE = "+8801712345678"
PASSWORD = "river-lamp-42-orchid"
WEB = {"X-Client": "web"}
COOKIE = "hh_refresh"


def signup_data(location, **changes) -> dict:
    return {
        "phone": "01712345678",
        "password": PASSWORD,
        "full_name": "Rahima Akhter",
        "gender": "FEMALE",
        "age": 34,
        "location_id": str(location.pk),
        **changes,
    }


def sign_up(client: APIClient, location, headers=None, **changes):
    return client.post(SIGNUP, signup_data(location, **changes), format="json", headers=headers)


def last_code() -> str:
    """The code in the most recent text message."""
    found = re.search(r"\b(\d{6})\b", MemorySmsProvider.outbox[-1].message)
    assert found, MemorySmsProvider.outbox[-1].message
    return found.group(1)


def wrong(code: str) -> str:
    return f"{(int(code) + 1) % 1_000_000:06d}"


def verify(client: APIClient, verification_id: str, code: str):
    return client.post(
        VERIFY, {"verification_id": verification_id, "code": code}, format="json", headers=WEB
    )


def verified_patient(client: APIClient, location, **changes):
    """Sign up and verify; the client ends up holding the refresh cookie."""
    started = sign_up(client, location, **changes)
    assert started.status_code == 201, started.content
    session = verify(client, started.json()["verification_id"], last_code())
    assert session.status_code == 200, session.content
    return session.json()


def log_in(client: APIClient, phone: str | int = PHONE, password: str = PASSWORD):
    return client.post(LOGIN, {"phone": phone, "password": password}, format="json", headers=WEB)


def refresh(client: APIClient):
    return client.post(REFRESH, headers=WEB)


def me(client: APIClient, access_token: str):
    return client.get(ME, headers={"Authorization": f"Bearer {access_token}"})


def error_code(response) -> str:
    return response.json()["error"]["code"]


def staff_phone(name: str) -> str:
    """A valid number that is always the same for the staff account called ``name``."""
    return f"+88017{zlib.crc32(name.encode()) % 100_000_000:08d}"
