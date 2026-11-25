import pytest
from django.core.cache import cache


@pytest.fixture(autouse=True)
def empty_cache():
    """Rate-limit counters live in the cache; every test starts from zero."""
    cache.clear()
    yield
