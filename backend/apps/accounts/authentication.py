from typing import Any

import jwt
from rest_framework.authentication import BaseAuthentication, get_authorization_header
from rest_framework.exceptions import AuthenticationFailed
from rest_framework.request import Request

from . import tokens
from .principals import load_principal


class AccessTokenAuthentication(BaseAuthentication):
    """``Authorization: Bearer <access token>``. Signing out takes effect immediately."""

    def authenticate(self, request: Request) -> tuple[Any, dict] | None:
        parts = get_authorization_header(request).split()
        if len(parts) != 2 or parts[0].lower() != b"bearer":
            return None
        try:
            claims = tokens.read_access_token(parts[1].decode())
        except (jwt.InvalidTokenError, UnicodeDecodeError) as error:
            raise AuthenticationFailed("The access token is not valid.") from error
        principal = (
            load_principal(claims["user_type"], claims["user_id"])
            if tokens.session_is_open(claims["sid"])
            else None
        )
        if principal is None:
            raise AuthenticationFailed("The session has ended.")
        return principal, claims

    def authenticate_header(self, request: Request) -> str:
        return "Bearer"  # makes failures 401 rather than 403
