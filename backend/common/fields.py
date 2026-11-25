from typing import Any

from rest_framework import serializers

from common.phone import InvalidPhone, normalize_phone


class PhoneField(serializers.CharField):
    """A Bangladeshi mobile number typed any common way; cleaned to ``+8801XXXXXXXXX``."""

    default_error_messages = {"INVALID_PHONE": "Enter a Bangladeshi mobile number."}

    def __init__(self, **kwargs: Any) -> None:
        kwargs.setdefault("max_length", 30)
        super().__init__(**kwargs)

    def to_internal_value(self, data: Any) -> str:
        text = super().to_internal_value(data)
        try:
            return normalize_phone(text)
        except InvalidPhone:
            self.fail("INVALID_PHONE")
