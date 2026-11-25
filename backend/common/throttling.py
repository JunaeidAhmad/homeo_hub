"""Rate limits. Counters live in the cache (Redis).

Public reads *fail open*: if the cache is unreachable the page still loads.
Limits that protect accounts (sign-in, SMS codes) use DRF's default behaviour and
fail closed.
"""

import logging

from redis.exceptions import RedisError
from rest_framework.request import Request
from rest_framework.throttling import AnonRateThrottle

from common.client_address import client_address

logger = logging.getLogger(__name__)


class PublicReadThrottle(AnonRateThrottle):
    """Per-visitor limit on anonymous requests (the default for every view)."""

    scope = "public_read"

    def get_ident(self, request: Request) -> str:
        return client_address(request)

    def allow_request(self, request: Request, view) -> bool:
        try:
            return super().allow_request(request, view)
        except RedisError:
            logger.warning("Rate limit skipped: the cache is unreachable", exc_info=True)
            return True
