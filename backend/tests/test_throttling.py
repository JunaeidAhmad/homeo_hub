"""Public list endpoints are rate-limited per visitor."""

import pytest
from rest_framework.test import APIClient

from common.throttling import PublicReadThrottle

URL = "/api/v1/locations/"


@pytest.fixture
def three_per_minute(monkeypatch):
    monkeypatch.setattr(PublicReadThrottle, "rate", "3/min", raising=False)


@pytest.mark.django_db
def test_a_visitor_over_the_limit_is_asked_to_wait(three_per_minute):
    client = APIClient()
    for _ in range(3):
        assert client.get(URL).status_code == 200

    response = client.get(URL)

    assert response.status_code == 429
    assert int(response["Retry-After"]) > 0


@pytest.mark.django_db
def test_each_visitor_has_their_own_limit(three_per_minute):
    client = APIClient()
    for _ in range(4):
        client.get(URL, REMOTE_ADDR="10.0.0.1")

    assert client.get(URL, REMOTE_ADDR="10.0.0.2").status_code == 200


@pytest.mark.django_db
def test_health_checks_are_never_limited(three_per_minute):
    client = APIClient()

    codes = {client.get("/api/v1/health/live").status_code for _ in range(6)}

    assert codes == {200}


@pytest.mark.django_db
def test_public_reads_keep_working_when_the_cache_is_down(three_per_minute, settings):
    settings.CACHES = {
        "default": {
            "BACKEND": "django.core.cache.backends.redis.RedisCache",
            "LOCATION": "redis://127.0.0.1:1/0",  # nothing listens on port 1
        }
    }

    assert APIClient().get(URL).status_code == 200
