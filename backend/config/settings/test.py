"""pytest: always the local Postgres (pytest-django creates test_<name>).

USE_NEON is ignored so tests can never touch the Neon database.
"""

from .base import *  # noqa: F403
from .base import database_config, env

SECRET_KEY = "test-only-secret"  # noqa: S105
ALLOWED_HOSTS = ["testserver", "localhost"]
DATABASES = {
    "default": database_config(
        env.str("DATABASE_URL", default="postgres://postgres@localhost:5432/homeohub")
    )
}
# In-memory cache: tests stay isolated from whatever is in the developer's Redis.
CACHES = {"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}}
PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]
