from typing import Any

from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from common.i18n import localized_text


@extend_schema_field(str)
class LocalizedField(serializers.Field):
    """Read-only text of a ``<name>_en`` / ``<name>_bn`` pair in the request's language."""

    def __init__(self, **kwargs: Any) -> None:
        super().__init__(source="*", read_only=True, **kwargs)

    def to_representation(self, instance: Any) -> str:
        return localized_text(instance, self.field_name or "")
