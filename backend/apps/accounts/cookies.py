"""The refresh token lives only in a cookie; page scripts cannot read it.

Each kind of user has its own cookie, so signing in as staff does not sign out a
patient in the same browser, and the staff cookie is only sent to staff endpoints.
"""

from django.conf import settings
from rest_framework.response import Response

from .tokens import Session

# user type -> (cookie name, path it is sent to)
COOKIES = {
    "patient": ("hh_refresh", "/api/v1/auth/"),
    "staff": ("hh_staff_refresh", "/api/v1/auth/staff/"),
}


def refresh_cookie_name(user_type: str) -> str:
    return COOKIES[user_type][0]


def set_refresh_cookie(response: Response, session: Session) -> None:
    name, path = COOKIES[session.user_type]
    response.set_cookie(
        name,
        session.refresh_token,
        max_age=session.refresh_max_age,
        path=path,
        httponly=True,
        secure=settings.REFRESH_COOKIE_SECURE,
        samesite="Strict",
    )


def clear_refresh_cookie(response: Response, user_type: str) -> None:
    name, path = COOKIES[user_type]
    response.delete_cookie(name, path=path, samesite="Strict")
