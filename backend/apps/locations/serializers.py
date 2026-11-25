from rest_framework import serializers

from common.i18n import localized_text

from .models import Location


class LocationSerializer(serializers.ModelSerializer):
    """An area with its names in the language the client asked for."""

    division = serializers.SerializerMethodField()
    district = serializers.SerializerMethodField()
    upazila = serializers.SerializerMethodField()
    display_name = serializers.SerializerMethodField()

    class Meta:
        model = Location
        fields = ["id", "division", "district", "upazila", "display_name"]

    def get_division(self, obj: Location) -> str:
        return localized_text(obj, "division")

    def get_district(self, obj: Location) -> str:
        return localized_text(obj, "district")

    def get_upazila(self, obj: Location) -> str:
        return localized_text(obj, "upazila")

    def get_display_name(self, obj: Location) -> str:
        """Upazila, district, division: one line for a picker to show."""
        return ", ".join(
            localized_text(obj, level) for level in ("upazila", "district", "division")
        )
