"""The API answers in the language the client asked for (bn or en)."""

from types import SimpleNamespace

import pytest
from django.utils import translation
from rest_framework.test import APIClient

from common.i18n import localized_text


@pytest.fixture
def client() -> APIClient:
    return APIClient()


@pytest.mark.parametrize(
    ("accept_language", "expected"),
    [
        ("bn", "bn"),
        ("bn-BD,bn;q=0.9,en;q=0.8", "bn"),
        ("en-US,en;q=0.9", "en"),
        ("fr-FR,fr;q=0.9", "en"),  # unsupported language falls back to English
        (None, "en"),  # no header at all
    ],
)
def test_response_names_the_language_it_resolved(client, accept_language, expected):
    headers = {"Accept-Language": accept_language} if accept_language else {}

    response = client.get("/api/v1/health/live", headers=headers)

    assert response["Content-Language"] == expected
    assert "Accept-Language" in response["Vary"]


def test_bangla_text_is_used_when_the_client_asked_for_bangla():
    remedy = SimpleNamespace(name_en="Diarrhoea", name_bn="ডায়রিয়া")

    with translation.override("bn"):
        assert localized_text(remedy, "name") == "ডায়রিয়া"


def test_english_text_is_used_when_the_client_asked_for_english():
    remedy = SimpleNamespace(name_en="Diarrhoea", name_bn="ডায়রিয়া")

    with translation.override("en"):
        assert localized_text(remedy, "name") == "Diarrhoea"


@pytest.mark.parametrize("empty_bangla", ["", "   ", None])
def test_english_is_the_fallback_when_bangla_text_is_empty(empty_bangla):
    remedy = SimpleNamespace(name_en="Diarrhoea", name_bn=empty_bangla)

    with translation.override("bn"):
        assert localized_text(remedy, "name") == "Diarrhoea"
