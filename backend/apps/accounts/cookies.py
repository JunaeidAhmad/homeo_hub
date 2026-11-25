"""The refresh token lives only in this cookie; page scripts cannot read it."""

from django.conf import settings
from rest_framework.response import Response

from .tokens import Session

REFRESH_COOKIE = "hh_refresh"
PATH = "/api/v1/auth/"


def set_refresh_cookie(response: Response, session: Session) -> None:
    response.set_cookie(
        REFRESH_COOKIE,
        session.refresh_token,
        max_age=session.refresh_max_age,
        path=PATH,
        httponly=True,
        secure=settings.REFRESH_COOKIE_SECURE,
        samesite="Strict",
    )


def clear_refresh_cookie(response: Response) -> None:
    response.delete_cookie(REFRESH_COOKIE, path=PATH, samesite="Strict")
