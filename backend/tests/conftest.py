from datetime import timedelta

import pytest
from django.core.cache import cache
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.sms import MemorySmsProvider
from apps.locations.models import Location


@pytest.fixture(autouse=True)
def empty_cache():
    """Rate-limit counters live in the cache; every test starts from zero."""
    cache.clear()
    yield


@pytest.fixture(autouse=True)
def sms_outbox():
    """Text messages "sent" during a test (the test settings use the in-memory provider)."""
    MemorySmsProvider.outbox.clear()
    return MemorySmsProvider.outbox


@pytest.fixture
def api() -> APIClient:
    return APIClient()


@pytest.fixture
def location(db) -> Location:
    return Location.objects.create(
        division_en="Dhaka",
        division_bn="ঢাকা",
        district_en="Gazipur",
        district_bn="গাজীপুর",
        upazila_en="Kapasia",
        upazila_bn="কাপাসিয়া",
    )


@pytest.fixture
def clock(monkeypatch):
    """Move "now" forward: ``clock.advance(minutes=16)``."""

    class Clock:
        def __init__(self) -> None:
            self.offset = timedelta()

        def advance(self, **kwargs: float) -> None:
            self.offset += timedelta(**kwargs)

    state = Clock()
    real_now = timezone.now
    monkeypatch.setattr(timezone, "now", lambda: real_now() + state.offset)
    return state
