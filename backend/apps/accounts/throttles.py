"""Limits that protect accounts. They fail closed: if the cache is down, requests fail."""

from rest_framework.request import Request
from rest_framework.throttling import SimpleRateThrottle

from common.client_address import client_address
from common.phone import InvalidPhone, normalize_phone


class LoginPhoneThrottle(SimpleRateThrottle):
    """Sign-in tries per phone number, however the number is typed."""

    scope = "login_phone"

    def get_cache_key(self, request: Request, view) -> str | None:
        phone = request.data.get("phone") if hasattr(request.data, "get") else None
        # The serializer also accepts a JSON number, so it must count here too.
        if isinstance(phone, bool) or not isinstance(phone, str | int | float):
            return None
        phone = str(phone).strip()
        if not phone:
            return None
        try:
            phone = normalize_phone(phone)
        except InvalidPhone:
            phone = phone[:30]
        return self.cache_format % {"scope": self.scope, "ident": phone}


class _PerAddressThrottle(SimpleRateThrottle):
    def get_ident(self, request: Request) -> str:
        return client_address(request)

    def get_cache_key(self, request: Request, view) -> str:
        return self.cache_format % {"scope": self.scope, "ident": self.get_ident(request)}


class LoginAddressThrottle(_PerAddressThrottle):
    scope = "login_ip"


class CodeAddressThrottle(_PerAddressThrottle):
    """Requests that may send a text, per address (each number also has its own limit)."""

    scope = "otp_ip"
