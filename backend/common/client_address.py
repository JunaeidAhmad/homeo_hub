"""Which visitor a request comes from, for rate limits."""

from django.conf import settings
from django.utils.crypto import constant_time_compare
from rest_framework.request import Request
from rest_framework.throttling import BaseThrottle


def client_address(request: Request) -> str:
    """The visitor's address.

    The web app forwards browser requests from its own server, so it names the visitor
    in ``X-Client-Address`` and proves it is the web app with ``X-Proxy-Secret``. Anyone
    else is identified by the address our own infrastructure saw (``NUM_PROXIES``);
    whatever else they claim in headers is ignored.
    """
    secret = settings.PROXY_SHARED_SECRET
    if secret and constant_time_compare(request.headers.get("X-Proxy-Secret", ""), secret):
        visitor = request.headers.get("X-Client-Address", "").strip()
        if visitor:
            return visitor[:64]
    return BaseThrottle().get_ident(request)
