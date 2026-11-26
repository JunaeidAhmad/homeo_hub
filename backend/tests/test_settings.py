"""Production and staging settings must refuse to start without their secrets.

Each case loads Django in a fresh subprocess with a clean environment and an
empty env file, so backend/.env on the developer machine cannot leak in.
"""

import os
import subprocess
import sys
from pathlib import Path

import pytest

BACKEND_DIR = Path(__file__).resolve().parent.parent

COMPLETE_ENV = {
    "SECRET_KEY": "a-real-secret-that-is-long-enough-to-sign-tokens",
    "DATABASE_URL": "postgres://u:p@db.example.com:5432/homeohub",
    "REDIS_URL": "redis://cache.example.com:6379/0",
    "ALLOWED_HOSTS": "api.example.com",
    "CORS_ALLOWED_ORIGINS": "https://app.example.com",
    "PROXY_SHARED_SECRET": "shared-between-the-web-app-and-the-api",
}


def load_settings(
    module: str, env: dict[str, str], tmp_path: Path, then: str = ""
) -> subprocess.CompletedProcess:
    empty_env_file = tmp_path / "empty.env"
    empty_env_file.write_text("")
    return subprocess.run(
        [sys.executable, "-c", f"import django; django.setup(); {then}"],
        cwd=BACKEND_DIR,
        env={
            "PATH": os.environ.get("PATH", ""),
            "DJANGO_SETTINGS_MODULE": module,
            "ENV_FILE": str(empty_env_file),
            **env,
        },
        capture_output=True,
        text=True,
        timeout=60,
    )


@pytest.mark.parametrize("module", ["config.settings.production", "config.settings.staging"])
def test_starts_when_every_secret_is_set(module, tmp_path):
    result = load_settings(module, COMPLETE_ENV, tmp_path)

    assert result.returncode == 0, result.stderr


@pytest.mark.parametrize("module", ["config.settings.production", "config.settings.staging"])
def test_refuses_to_start_and_names_the_missing_secrets(module, tmp_path):
    env = {k: v for k, v in COMPLETE_ENV.items() if k not in ("SECRET_KEY", "REDIS_URL")}

    result = load_settings(module, env, tmp_path)

    assert result.returncode != 0
    assert "ImproperlyConfigured" in result.stderr
    assert "SECRET_KEY" in result.stderr
    assert "REDIS_URL" in result.stderr
    assert "DATABASE_URL" not in result.stderr.splitlines()[-1]


def test_refuses_a_signing_key_too_short_to_be_safe(tmp_path):
    env = {**COMPLETE_ENV, "SECRET_KEY": "short-secret"}

    result = load_settings("config.settings.production", env, tmp_path)

    assert result.returncode != 0
    assert "SECRET_KEY" in result.stderr


def test_production_never_logs_codes_or_sends_cookies_over_http_by_default(tmp_path):
    show = "from django.conf import settings as s; print(s.SMS_PROVIDER, s.REFRESH_COOKIE_SECURE)"

    result = load_settings("config.settings.production", COMPLETE_ENV, tmp_path, then=show)

    assert result.stdout.split() == ["apps.accounts.sms.UnconfiguredSmsProvider", "True"]


def test_production_derives_web_addresses_and_accepts_the_render_host(tmp_path):
    show = (
        "from django.conf import settings as s; "
        "print(s.WEB_APP_URL, ','.join(s.CSRF_TRUSTED_ORIGINS), ','.join(s.ALLOWED_HOSTS))"
    )
    env = {**COMPLETE_ENV, "RENDER_EXTERNAL_HOSTNAME": "api-x1y2.onrender.com"}

    result = load_settings("config.settings.production", env, tmp_path, then=show)

    assert result.stdout.split() == [
        "https://app.example.com",
        "https://app.example.com",
        "api.example.com,api-x1y2.onrender.com",
    ], result.stderr
