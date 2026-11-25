from rest_framework import serializers

from common.i18n import localized_text
from common.serializers import LocalizedField

from .models import Location


class LocationSerializer(serializers.ModelSerializer):
    """An area with its names in the language the client asked for."""

    division = LocalizedField()
    district = LocalizedField()
    upazila = LocalizedField()
    display_name = serializers.SerializerMethodField()

    class Meta:
        model = Location
        fields = ["id", "division", "district", "upazila", "display_name"]

    def get_display_name(self, obj: Location) -> str:
        """Upazila, district, division: one line for a picker to show."""
        return ", ".join(
            localized_text(obj, level) for level in ("upazila", "district", "division")
        )
