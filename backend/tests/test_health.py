import pytest
from rest_framework.test import APIClient


@pytest.fixture
def client() -> APIClient:
    return APIClient()


def test_live_reports_ok_without_touching_dependencies(client):
    response = client.get("/api/v1/health/live")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


@pytest.mark.django_db
def test_ready_reports_ok_when_postgres_and_redis_answer(client):
    response = client.get("/api/v1/health/ready")

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "checks": {"database": "ok", "redis": "ok"},
    }


@pytest.mark.django_db
def test_ready_is_unavailable_when_redis_does_not_answer(client, settings):
    settings.REDIS_URL = "redis://127.0.0.1:1/0"  # nothing listens on port 1

    response = client.get("/api/v1/health/ready")

    assert response.status_code == 503
    assert response.json() == {
        "status": "degraded",
        "checks": {"database": "ok", "redis": "error"},
    }


def test_ready_is_unavailable_when_the_database_cannot_be_reached(client):
    # No django_db mark: pytest-django refuses every query, as a dead database would.
    response = client.get("/api/v1/health/ready")

    assert response.status_code == 503
    assert response.json()["checks"] == {"database": "error", "redis": "ok"}
