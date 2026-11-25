"""Developer machine: native Postgres 16 and Redis, DEBUG on."""

from .base import *  # noqa: F403
from .base import env

DEBUG = True
SECRET_KEY = env.str("SECRET_KEY", default="") or "django-insecure-local-only"
ALLOWED_HOSTS = env.list("ALLOWED_HOSTS", default=["localhost", "127.0.0.1"])
CORS_ALLOWED_ORIGINS = env.list("CORS_ALLOWED_ORIGINS", default=["http://localhost:3000"])
