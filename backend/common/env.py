"""Helpers for reading settings from the environment."""

from collections.abc import Iterable

import environ
from django.core.exceptions import ImproperlyConfigured


def require(env: environ.Env, names: Iterable[str]) -> None:
    """Fail fast, naming every required variable that is missing or empty."""
    missing = [name for name in names if not env.str(name, default="").strip()]
    if missing:
        raise ImproperlyConfigured("Missing required environment variables: " + ", ".join(missing))
