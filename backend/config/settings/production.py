"""Production (Render + Neon). Refuses to start without its secrets."""

from django.core.exceptions import ImproperlyConfigured

from common.env import require

from .base import *  # noqa: F403
from .base import database_config, env

REQUIRED_ENV = [
    "SECRET_KEY",
    "DATABASE_URL",
    "REDIS_URL",
    "ALLOWED_HOSTS",
    "CORS_ALLOWED_ORIGINS",
    "PROXY_SHARED_SECRET",
]
require(env, REQUIRED_ENV)
if len(env.str("SECRET_KEY")) < 32:
    raise ImproperlyConfigured(
        "SECRET_KEY must be at least 32 characters (it signs sign-in tokens)"
    )

DEBUG = False
# Always DATABASE_URL here: USE_NEON is a local-only switch.
DATABASES = {"default": database_config(env.str("DATABASE_URL"))}
DATABASES["default"]["CONN_MAX_AGE"] = env.int("DB_CONN_MAX_AGE", default=60)

# Render names the service's own host; accept it whatever the service ended up being called.
if render_host := env.str("RENDER_EXTERNAL_HOSTNAME", default=""):
    ALLOWED_HOSTS = [*ALLOWED_HOSTS, render_host]  # noqa: F405
# The web app forwards the browser's requests, so its origin is also the one to trust for
# forms (the mock payment page) and to send people back to after paying.
CSRF_TRUSTED_ORIGINS = CSRF_TRUSTED_ORIGINS or CORS_ALLOWED_ORIGINS  # noqa: F405
WEB_APP_URL = env.str("WEB_APP_URL", default="") or CORS_ALLOWED_ORIGINS[0]  # noqa: F405

SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SECURE_SSL_REDIRECT = env.bool("SECURE_SSL_REDIRECT", default=True)
SECURE_REDIRECT_EXEMPT = [r"^api/v1/health/"]
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SECURE_HSTS_SECONDS = env.int("SECURE_HSTS_SECONDS", default=60 * 60 * 24 * 30)
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_CONTENT_TYPE_NOSNIFF = True

STORAGES["staticfiles"] = {  # noqa: F405
    "BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage"
}
# A server's own disk is wiped on every deploy: without a bucket, refuse uploads
# rather than lose them.
UPLOADS_ENABLED = bool(STORAGE_BUCKET)  # noqa: F405
