from typing import Any

from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from common.i18n import localized_text
from common.serializers import LocalizedField

from .choices import Potency, RemedyForm
from .models import Remedy, RemedyPrice

_FORM_ORDER = {RemedyForm.PILL: 0, RemedyForm.LIQUID: 1}


@extend_schema_field({"type": "string", "format": "uri", "nullable": True})
class PictureUrlField(serializers.Field):
    """The picture's full address, or null."""

    def __init__(self, **kwargs: Any) -> None:
        super().__init__(source="*", read_only=True, **kwargs)

    def to_representation(self, remedy: Remedy) -> str | None:
        if not remedy.picture:
            return None
        url = remedy.picture.url
        request = self.context.get("request")
        return request.build_absolute_uri(url) if request else url


def _lines(text: str) -> list[str]:
    return [line.strip() for line in text.splitlines() if line.strip()]


class PatientPriceSerializer(serializers.ModelSerializer):
    class Meta:
        model = RemedyPrice
        fields = ["form", "price_poisha"]


class AdminPriceSerializer(serializers.ModelSerializer):
    class Meta:
        model = RemedyPrice
        fields = ["id", "form", "price_poisha", "is_active", "updated_at"]


class AdminPriceInputSerializer(serializers.Serializer):
    form = serializers.ChoiceField(choices=RemedyForm.choices)
    price_poisha = serializers.IntegerField(min_value=1, max_value=10_000_000)
    is_active = serializers.BooleanField(default=True)


class RemedyCardSerializer(serializers.ModelSerializer):
    """A remedy in a list, in the language asked for."""

    picture_url = PictureUrlField()
    indication = LocalizedField()
    prices = serializers.SerializerMethodField()

    class Meta:
        model = Remedy
        fields = ["id", "name", "name_bn", "slug", "picture_url", "indication", "prices"]

    @extend_schema_field(PatientPriceSerializer(many=True))
    def get_prices(self, remedy: Remedy) -> list[dict[str, Any]]:
        rows = getattr(remedy, "active_prices", None)
        if rows is None:
            rows = list(remedy.prices.filter(is_active=True))
        ordered = sorted(rows, key=lambda row: _FORM_ORDER.get(row.form, 99))
        return list(PatientPriceSerializer(ordered, many=True).data)


class RemedyDetailSerializer(RemedyCardSerializer):
    description = LocalizedField()
    advice_do = serializers.SerializerMethodField()
    advice_dont = serializers.SerializerMethodField()
    potencies = serializers.SerializerMethodField()

    class Meta(RemedyCardSerializer.Meta):
        fields = [
            *RemedyCardSerializer.Meta.fields,
            "description",
            "advice_do",
            "advice_dont",
            "potencies",
        ]

    def get_advice_do(self, remedy: Remedy) -> list[str]:
        return _lines(localized_text(remedy, "advice_do"))

    def get_advice_dont(self, remedy: Remedy) -> list[str]:
        return _lines(localized_text(remedy, "advice_dont"))

    @extend_schema_field(
        serializers.ListField(child=serializers.ChoiceField(choices=Potency.choices))
    )
    def get_potencies(self, remedy: Remedy) -> list[str]:
        return list(Potency.values)


class AdminRemedySerializer(serializers.ModelSerializer):
    """Everything about a remedy, both languages, for the editor."""

    picture_url = PictureUrlField()
    prices = AdminPriceSerializer(many=True, read_only=True)
    # Uniqueness is checked by the service, which answers with a clearer error code.
    slug = serializers.SlugField(max_length=160, required=False, allow_blank=True)

    class Meta:
        model = Remedy
        fields = [
            "id",
            "name",
            "name_bn",
            "slug",
            "status",
            "description_en",
            "description_bn",
            "indication_en",
            "indication_bn",
            "advice_do_en",
            "advice_do_bn",
            "advice_dont_en",
            "advice_dont_bn",
            "picture_url",
            "prices",
            "updated_at",
        ]
        read_only_fields = ["id", "updated_at"]
        validators: list = []
        extra_kwargs = {
            field: {"max_length": 5000}
            for base in ("description", "indication", "advice_do", "advice_dont")
            for field in (f"{base}_en", f"{base}_bn")
        }


class PictureUploadSerializer(serializers.Serializer):
    # A plain file field: common.images checks the content itself.
    picture = serializers.FileField()
