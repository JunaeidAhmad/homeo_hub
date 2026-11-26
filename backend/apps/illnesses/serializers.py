from typing import Any

from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from apps.remedies.serializers import RemedyCardSerializer
from common.i18n import localized_text
from common.serializers import LocalizedField

from .models import Illness, IllnessCategory, IllnessRemedy
from .selectors import ranked_public_remedies


class AdminIllnessCategorySerializer(serializers.ModelSerializer):
    slug = serializers.SlugField(max_length=160, required=False, allow_blank=True)

    class Meta:
        model = IllnessCategory
        fields = ["id", "name_en", "name_bn", "slug", "sort_order", "is_active", "updated_at"]
        read_only_fields = ["id", "updated_at"]
        validators: list = []


class AdminIllnessSerializer(serializers.ModelSerializer):
    slug = serializers.SlugField(max_length=160, required=False, allow_blank=True)
    category_name_en = serializers.CharField(source="category.name_en", read_only=True)

    class Meta:
        model = Illness
        fields = [
            "id",
            "category",
            "category_name_en",
            "name_en",
            "name_bn",
            "slug",
            "short_description_en",
            "short_description_bn",
            "status",
            "updated_at",
        ]
        read_only_fields = ["id", "category_name_en", "updated_at"]
        validators: list = []
        extra_kwargs = {
            "short_description_en": {"max_length": 2000},
            "short_description_bn": {"max_length": 2000},
        }


class AdminIllnessRemedySerializer(serializers.ModelSerializer):
    remedy_id = serializers.UUIDField(source="remedy.id", read_only=True)
    remedy_name = serializers.CharField(source="remedy.name", read_only=True)
    remedy_name_bn = serializers.CharField(source="remedy.name_bn", read_only=True)
    remedy_slug = serializers.CharField(source="remedy.slug", read_only=True)
    remedy_status = serializers.CharField(source="remedy.status", read_only=True)
    picture_url = serializers.SerializerMethodField()

    class Meta:
        model = IllnessRemedy
        fields = [
            "id",
            "remedy_id",
            "remedy_name",
            "remedy_name_bn",
            "remedy_slug",
            "remedy_status",
            "picture_url",
            "rank",
        ]

    @extend_schema_field({"type": "string", "format": "uri", "nullable": True})
    def get_picture_url(self, item: IllnessRemedy) -> str | None:
        if not item.remedy.picture:
            return None
        url = item.remedy.picture.url
        request = self.context.get("request")
        return request.build_absolute_uri(url) if request else url


class AdminRankedRemediesInputSerializer(serializers.Serializer):
    remedy_ids = serializers.ListField(child=serializers.UUIDField())


class PublicIllnessSummarySerializer(serializers.ModelSerializer):
    name = LocalizedField()

    class Meta:
        model = Illness
        fields = ["id", "slug", "name"]


class PublicIllnessCategorySerializer(serializers.ModelSerializer):
    name = LocalizedField()
    illnesses = PublicIllnessSummarySerializer(source="active_illnesses", many=True, read_only=True)

    class Meta:
        model = IllnessCategory
        fields = ["id", "slug", "name", "illnesses"]


class RankedRemedyCardSerializer(RemedyCardSerializer):
    rank = serializers.IntegerField(read_only=True)

    class Meta(RemedyCardSerializer.Meta):
        fields = [*RemedyCardSerializer.Meta.fields, "rank"]


class PublicIllnessDetailSerializer(serializers.ModelSerializer):
    name = LocalizedField()
    short_description = LocalizedField()
    category_name = serializers.SerializerMethodField()
    remedies = serializers.SerializerMethodField()

    class Meta:
        model = Illness
        fields = ["id", "slug", "name", "short_description", "category_name", "remedies"]

    def get_category_name(self, illness: Illness) -> str:
        return localized_text(illness.category, "name")

    @extend_schema_field(RankedRemedyCardSerializer(many=True))
    def get_remedies(self, illness: Illness) -> list[dict[str, Any]]:
        remedies = ranked_public_remedies(illness)
        return list(RankedRemedyCardSerializer(remedies, many=True, context=self.context).data)
