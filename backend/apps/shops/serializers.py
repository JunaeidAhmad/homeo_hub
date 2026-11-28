from django.contrib.auth.models import User
from rest_framework import serializers

from apps.locations.models import Location
from apps.locations.serializers import LocationSerializer
from apps.remedies.models import Remedy
from common.fields import PhoneField

from .models import Shop, ShopRemedy, ShopStaff


class AdminShopSerializer(serializers.ModelSerializer):
    location_id = serializers.PrimaryKeyRelatedField(
        source="location", queryset=Location.objects.all(), write_only=True
    )
    location = LocationSerializer(read_only=True)
    phone = PhoneField()
    slug = serializers.SlugField(max_length=160, required=False, allow_blank=True)

    class Meta:
        model = Shop
        fields = [
            "id",
            "name",
            "slug",
            "location_id",
            "location",
            "address_line",
            "phone",
            "latitude",
            "longitude",
            "is_verified",
            "is_active",
            "updated_at",
        ]
        read_only_fields = ["id", "location", "updated_at"]
        validators: list = []


class AdminShopStaffSerializer(serializers.ModelSerializer):
    user_id = serializers.IntegerField(source="user.id", read_only=True)
    phone = serializers.CharField(source="user.username", read_only=True)
    full_name = serializers.CharField(source="user.first_name", read_only=True)

    class Meta:
        model = ShopStaff
        fields = ["id", "user_id", "phone", "full_name", "role", "created_at"]
        read_only_fields = fields


class AdminShopStaffInputSerializer(serializers.Serializer):
    user_id = serializers.PrimaryKeyRelatedField(queryset=User.objects.all(), source="user")
    role = serializers.ChoiceField(choices=ShopStaff.Role.choices, default=ShopStaff.Role.OWNER)


class AdminShopStaffCandidateSerializer(serializers.ModelSerializer):
    phone = serializers.CharField(source="username", read_only=True)
    full_name = serializers.CharField(source="first_name", read_only=True)

    class Meta:
        model = User
        fields = ["id", "phone", "full_name"]
        read_only_fields = fields


class ShopRemedyInfoSerializer(serializers.ModelSerializer):
    class Meta:
        model = Remedy
        fields = ["id", "name", "name_bn", "slug"]
        read_only_fields = fields


class AdminShopRemedySerializer(serializers.ModelSerializer):
    remedy_id = serializers.PrimaryKeyRelatedField(
        source="remedy", queryset=Remedy.objects.all(), write_only=True
    )
    remedy = ShopRemedyInfoSerializer(read_only=True)
    free_qty = serializers.IntegerField(read_only=True)
    pack_size = serializers.IntegerField(min_value=1, max_value=100_000)
    price_poisha = serializers.IntegerField(min_value=1, max_value=10_000_000)
    stock_qty = serializers.IntegerField(min_value=0, max_value=1_000_000, default=0)

    class Meta:
        model = ShopRemedy
        fields = [
            "id",
            "remedy_id",
            "remedy",
            "pack_size",
            "unit",
            "price_poisha",
            "stock_qty",
            "reserved_qty",
            "free_qty",
            "is_available",
            "updated_at",
        ]
        read_only_fields = ["id", "remedy", "reserved_qty", "free_qty", "updated_at"]
        validators: list = []


class AdminShopRemedyUpdateSerializer(serializers.Serializer):
    pack_size = serializers.IntegerField(min_value=1, max_value=100_000, required=False)
    unit = serializers.ChoiceField(choices=ShopRemedy.Unit.choices, required=False)
    price_poisha = serializers.IntegerField(min_value=1, max_value=10_000_000, required=False)
    stock_qty = serializers.IntegerField(min_value=0, max_value=1_000_000, required=False)
    is_available = serializers.BooleanField(required=False)
