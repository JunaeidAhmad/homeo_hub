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
    "SECRET_KEY": "a-real-secret",
    "DATABASE_URL": "postgres://u:p@db.example.com:5432/homeohub",
    "REDIS_URL": "redis://cache.example.com:6379/0",
    "ALLOWED_HOSTS": "api.example.com",
    "CORS_ALLOWED_ORIGINS": "https://app.example.com",
}


def load_settings(module: str, env: dict[str, str], tmp_path: Path) -> subprocess.CompletedProcess:
    empty_env_file = tmp_path / "empty.env"
    empty_env_file.write_text("")
    return subprocess.run(
        [sys.executable, "-c", "import django; django.setup()"],
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
