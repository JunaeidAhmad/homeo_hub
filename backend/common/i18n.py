"""Bangla + English content.

Translatable model fields come in pairs, ``<field>_en`` and ``<field>_bn``.
English is required; Bangla may be empty until an editor fills it in.
"""

from typing import Any

from django.utils import translation

DEFAULT_LANGUAGE = "en"


def current_language() -> str:
    """The language of this request: "bn" or "en"."""
    return "bn" if translation.get_language() == "bn" else DEFAULT_LANGUAGE


def localized_text(obj: Any, field: str) -> str:
    """The text of ``field`` in the request's language, English when Bangla is empty."""
    if current_language() == "bn":
        bangla = getattr(obj, f"{field}_bn", None)
        if bangla and bangla.strip():
            return str(bangla)
    return str(getattr(obj, f"{field}_{DEFAULT_LANGUAGE}"))
