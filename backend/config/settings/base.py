"""Settings shared by every environment.

Environment files (local.py, test.py, staging.py, production.py) import this
module and add or override what differs. Values come from environment
variables; for local development they are read from backend/.env
(see backend/.env.example for every variable).
"""

from pathlib import Path

import environ

BASE_DIR = Path(__file__).resolve().parent.parent.parent

env = environ.Env()
# Real environment variables win over the file (Render/CI set them directly).
# ENV_FILE points at another file (tests use it to load an empty one).
environ.Env.read_env(env.str("ENV_FILE", default=str(BASE_DIR / ".env")), overwrite=False)

SECRET_KEY = env.str("SECRET_KEY", default="")
DEBUG = False
ALLOWED_HOSTS: list[str] = env.list("ALLOWED_HOSTS", default=[])

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "django.contrib.postgres",
    "corsheaders",
    "django_filters",
    "rest_framework",
    "drf_spectacular",
    "apps.health",
    "apps.locations",
    "apps.accounts",
    "apps.patients",
    "apps.staff",
    "apps.remedies",
    "apps.illnesses",
    "apps.selfcare",
    "apps.orders",
    "apps.shops",
    "apps.payments",
    "apps.doctors",
    "apps.consultations",
    "apps.prescriptions",
    "apps.billing",
    "apps.notifications",
    "apps.audit",
    "apps.telemedicine",
]

MIDDLEWARE = [
    "common.middleware.RequestIdMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    # Resolves bn / en from Accept-Language and answers with Content-Language.
    "django.middleware.locale.LocaleMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]


# --- Database --------------------------------------------------------------
# DATABASE_URL is the database this process uses. Locally it points at the
# native Postgres 16; on Render it points at Neon. Locally, USE_NEON=true
# switches to NEON_DATABASE_URL (e.g. to run migrations against Neon).
def database_config(url: str) -> dict:
    config = env.db_url_config(url)
    config["CONN_MAX_AGE"] = env.int("DB_CONN_MAX_AGE", default=0)
    config["CONN_HEALTH_CHECKS"] = True
    if "-pooler." in config.get("HOST", ""):
        # Neon's pooler runs PgBouncer in transaction mode.
        config["DISABLE_SERVER_SIDE_CURSORS"] = True
    return config


def selected_database_url() -> str:
    if env.bool("USE_NEON", default=False):
        return env.str("NEON_DATABASE_URL", default="")
    return env.str("DATABASE_URL", default="")


DATABASE_URL = selected_database_url()
DATABASES = {"default": database_config(DATABASE_URL)} if DATABASE_URL else {}

# Production and staging require this to be set explicitly (see production.py).
REDIS_URL = env.str("REDIS_URL", default="redis://localhost:6379/0")

# Cache: rate-limit counters (and later, other short-lived data).
CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.redis.RedisCache",
        "LOCATION": REDIS_URL,
        "OPTIONS": {"socket_connect_timeout": 2, "socket_timeout": 2},
    }
}

PASSWORD_HASHERS = [
    "django.contrib.auth.hashers.Argon2PasswordHasher",
    "django.contrib.auth.hashers.PBKDF2PasswordHasher",
]

AUTH_PASSWORD_VALIDATORS = [
    {
        "NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator",
        "OPTIONS": {"user_attributes": ["full_name", "phone", "username", "first_name"]},
    },
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "en"
LANGUAGES = [("en", "English"), ("bn", "Bangla")]
TIME_ZONE = "Asia/Dhaka"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
# Uploaded files. An S3-compatible bucket (AWS S3, Cloudflare R2, ...) when
# STORAGE_BUCKET is set; otherwise the local media folder.
MEDIA_URL = "media/"
MEDIA_ROOT = BASE_DIR / "media"
STORAGE_BUCKET = env.str("STORAGE_BUCKET", default="")
UPLOADS_ENABLED = True
STORAGES: dict[str, dict] = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "private": {
        "BACKEND": "django.core.files.storage.FileSystemStorage",
        "OPTIONS": {"location": BASE_DIR / "private_media"},
    },
    "staticfiles": {"BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"},
}
if STORAGE_BUCKET:
    # A public address (CDN or public bucket domain) gives plain links; without one the
    # bucket stays private and links are signed and expire.
    _public_domain = env.str("STORAGE_PUBLIC_DOMAIN", default="")
    STORAGES["default"] = {
        "BACKEND": "storages.backends.s3.S3Storage",
        "OPTIONS": {
            "bucket_name": STORAGE_BUCKET,
            "endpoint_url": env.str("STORAGE_ENDPOINT_URL", default="") or None,
            "region_name": env.str("STORAGE_REGION", default="") or None,
            "access_key": env.str("STORAGE_ACCESS_KEY_ID", default=""),
            "secret_key": env.str("STORAGE_SECRET_ACCESS_KEY", default=""),
            "custom_domain": _public_domain or None,
            "querystring_auth": not _public_domain,
            "querystring_expire": 60 * 60,
            "file_overwrite": False,
        },
    }
    STORAGES["private"] = {
        "BACKEND": "storages.backends.s3.S3Storage",
        "OPTIONS": {
            "bucket_name": STORAGE_BUCKET,
            "endpoint_url": env.str("STORAGE_ENDPOINT_URL", default="") or None,
            "region_name": env.str("STORAGE_REGION", default="") or None,
            "access_key": env.str("STORAGE_ACCESS_KEY_ID", default=""),
            "secret_key": env.str("STORAGE_SECRET_ACCESS_KEY", default=""),
            "location": "private",
            "default_acl": "private",
            "querystring_auth": True,
            "querystring_expire": 60 * 60,
            "file_overwrite": False,
        },
    }

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

CORS_ALLOWED_ORIGINS: list[str] = env.list("CORS_ALLOWED_ORIGINS", default=[])
CSRF_TRUSTED_ORIGINS: list[str] = env.list("CSRF_TRUSTED_ORIGINS", default=[])

REST_FRAMEWORK = {
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    # The list convention every list endpoint follows (see common/search.py).
    "DEFAULT_FILTER_BACKENDS": [
        "django_filters.rest_framework.DjangoFilterBackend",
        "common.search.KeywordSearchFilter",
        "common.search.RankedOrderingFilter",
    ],
    "DEFAULT_PAGINATION_CLASS": "common.pagination.StandardPagination",
    "DEFAULT_THROTTLE_CLASSES": ["common.throttling.PublicReadThrottle"],
    "DEFAULT_THROTTLE_RATES": {
        "public_read": env.str("THROTTLE_PUBLIC_READ", default="300/min"),
        "login_phone": "5/min",
        "login_ip": "30/min",
        "otp_ip": "20/hour",
    },
    # How many reverse proxies sit in front of the API: only the addresses they add to
    # X-Forwarded-For are believed (see common/client_address.py).
    "NUM_PROXIES": env.int("NUM_PROXIES", default=1),
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
    "DEFAULT_PARSER_CLASSES": ["common.parsers.SafeJSONParser"],
    "DEFAULT_AUTHENTICATION_CLASSES": ["apps.accounts.authentication.AccessTokenAuthentication"],
    "EXCEPTION_HANDLER": "common.errors.exception_handler",
    # Endpoints are private unless a view opts out (health checks do).
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.IsAuthenticated"],
}

# --- Accounts ----------------------------------------------------------------
# How to find a signed-in person of each user type (see apps/accounts/principals.py).
PRINCIPAL_LOADERS = {
    "patient": "apps.patients.services.load_principal",
    "staff": "apps.staff.services.load_principal",
    "doctor": "apps.doctors.services.load_principal",
}
# Class that sends text messages. Only development uses the console one (it logs codes).
SMS_PROVIDER = env.str("SMS_PROVIDER", default="") or "apps.accounts.sms.UnconfiguredSmsProvider"
# A cost ceiling across all numbers, whatever the per-number limits allow.
OTP_MAX_SENDS_PER_HOUR = env.int("OTP_MAX_SENDS_PER_HOUR", default=500)
REFRESH_COOKIE_SECURE = True
# Same value as the web app's PROXY_SHARED_SECRET. Required in staging/production;
# Shared with the web app, which sends it when naming the visitor it is forwarding for.
PROXY_SHARED_SECRET = env.str("PROXY_SHARED_SECRET", default="")
DELIVERY_CHARGE_POISHA = env.int("DELIVERY_CHARGE_POISHA", default=6000)
PLATFORM_FEE_MODE = env.str("PLATFORM_FEE_MODE", default="FIXED")
PLATFORM_FEE_VALUE = env.int("PLATFORM_FEE_VALUE", default=0)
PAYMENT_GATEWAY = env.str("PAYMENT_GATEWAY", default="apps.payments.gateways.mock.MockGateway")
WEB_APP_URL = env.str("WEB_APP_URL", default="http://localhost:3000")
WEBPUSH_VAPID_PUBLIC_KEY = env.str("WEBPUSH_VAPID_PUBLIC_KEY", default="")
WEBPUSH_VAPID_PRIVATE_KEY = env.str("WEBPUSH_VAPID_PRIVATE_KEY", default="")
WEBPUSH_SUBJECT = env.str("WEBPUSH_SUBJECT", default="")
VIDEO_PROVIDER = env.str("VIDEO_PROVIDER", default="apps.telemedicine.video.PastedLinkProvider")

SPECTACULAR_SETTINGS = {
    "TITLE": "HomeoHub API",
    "DESCRIPTION": "HomeoHub REST API (v1).",
    "VERSION": "1.0.0",
    "SERVE_INCLUDE_SCHEMA": False,
    "SCHEMA_PATH_PREFIX": r"/api/v1",
    "COMPONENT_SPLIT_REQUEST": True,
    "ENUM_NAME_OVERRIDES": {
        "CheckResultEnum": "apps.health.serializers.CHECK_RESULT",
        "RoleEnum": "apps.staff.serializers.ROLE_CHOICES",
        "PermissionEnum": "apps.staff.serializers.PERMISSION_CHOICES",
        "RemedyStatusEnum": "apps.remedies.models.Remedy.Status",
        "IllnessStatusEnum": "apps.illnesses.models.Illness.Status",
        "PotenciesEnum": "apps.remedies.choices.Potency",
        "CartStatusEnum": "apps.orders.models.Cart.Status",
        "OrderStatusEnum": "apps.orders.models.Order.Status",
        "PaymentMethodEnum": "apps.orders.models.Order.PaymentMethod",
        "AssignmentStatusEnum": "apps.orders.models.ShopAssignment.Status",
        "PaymentStatusEnum": "apps.payments.models.Payment.Status",
        "PaymentEventKindEnum": "apps.payments.models.PaymentEvent.Kind",
        "DoctorStatusEnum": "apps.doctors.models.Doctor.Status",
        "ConsultationStatusEnum": "apps.consultations.models.DoctorConsultation.Status",
        "UrgencyEnum": "apps.consultations.models.DoctorConsultation.Urgency",
        "DurationUnitEnum": "apps.consultations.models.DoctorConsultation.DurationUnit",
        "QuestionTypeEnum": "apps.consultations.models.Question.Type",
        "BloodGroupEnum": "apps.patients.models.PatientProfile.BloodGroup",
        "MaritalStatusEnum": "apps.patients.models.PatientProfile.MaritalStatus",
        "ThermalPreferenceEnum": "apps.patients.models.PatientProfile.ThermalPreference",
        "ShopStaffRoleEnum": "apps.shops.models.ShopStaff.Role",
        "ShopUnitEnum": "apps.shops.models.ShopRemedy.Unit",
        "PrescriptionStatusEnum": "apps.prescriptions.models.Prescription.Status",
        "AdviceKindEnum": "apps.prescriptions.models.PrescriptionAdvice.Kind",
        "InvoiceStatusEnum": "apps.billing.models.ConsultationInvoice.Status",
        "UnavailableReasonEnum": "apps.prescriptions.serializers.UNAVAILABLE_REASON_CHOICES",
        "NotificationKindEnum": "apps.notifications.models.NotificationKind",
        "AuditActorTypeEnum": "apps.audit.models.AuditEntry.ActorType",
        "QuestionTemplateStatusEnum": "apps.consultations.models.QuestionTemplate.Status",
        "AppointmentStatusEnum": "apps.telemedicine.models.VideoAppointment.Status",
        "AppointmentEventKindEnum": "apps.telemedicine.models.AppointmentEvent.Kind",
        "CallSessionStatusEnum": "apps.telemedicine.models.CallSession.Status",
    },
}

DEFAULT_EXCEPTION_REPORTER_FILTER = "common.logging_filters.SensitiveDataFilter"

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {"console": {"class": "logging.StreamHandler"}},
    "root": {"handlers": ["console"], "level": env.str("LOG_LEVEL", default="INFO")},
}
