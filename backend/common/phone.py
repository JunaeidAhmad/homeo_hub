"""Bangladeshi mobile numbers, stored in one form: ``+8801XXXXXXXXX`` (E.164)."""

import re
import unicodedata

# Bangla digits ০-৯ (and any other script's digits) are accepted as typed.
SEPARATORS = re.compile(r"[\s\-().]")
# Optional +880 / 880 / 0 prefix, then an operator code 13-19 and eight digits.
MOBILE = re.compile(r"^(?:\+?880|0)?(1[3-9]\d{8})$")


class InvalidPhone(ValueError):
    pass


def ascii_digits(text: str) -> str:
    """Replace every Unicode decimal digit (e.g. Bangla ৫) with its ASCII form."""
    return "".join(str(unicodedata.digit(c)) if c.isdecimal() else c for c in text)


def normalize_phone(raw: str) -> str:
    match = MOBILE.match(SEPARATORS.sub("", ascii_digits(raw or "")))
    if not match:
        raise InvalidPhone(raw)
    return "+880" + match.group(1)
