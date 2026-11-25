"""Dependency probes for the readiness check."""

import logging

import redis
from django.conf import settings
from django.db import connection

logger = logging.getLogger(__name__)

TIMEOUT_SECONDS = 2


def database_ok() -> bool:
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
            cursor.fetchone()
    except Exception:
        logger.exception("Readiness: database check failed")
        return False
    return True


def redis_ok() -> bool:
    try:
        client = redis.Redis.from_url(
            settings.REDIS_URL,
            socket_timeout=TIMEOUT_SECONDS,
            socket_connect_timeout=TIMEOUT_SECONDS,
        )
        try:
            return bool(client.ping())
        finally:
            client.close()
    except Exception:
        logger.exception("Readiness: redis check failed")
        return False


def run_checks() -> dict[str, str]:
    return {
        "database": "ok" if database_ok() else "error",
        "redis": "ok" if redis_ok() else "error",
    }
