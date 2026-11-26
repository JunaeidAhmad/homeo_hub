from django.contrib.auth.models import User
from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from .roles import Perm, Role
from .services import permissions_of, roles_of

ROLE_CHOICES = [role.value for role in Role]
PERMISSION_CHOICES = [perm.value for perm in Perm]


def _roles_field(**kwargs) -> serializers.ListField:
    return serializers.ListField(child=serializers.ChoiceField(choices=ROLE_CHOICES), **kwargs)


class StaffLogInSerializer(serializers.Serializer):
    username = serializers.CharField(max_length=150)
    password = serializers.CharField(max_length=128, trim_whitespace=False, write_only=True)


class StaffTotpChallengeSerializer(serializers.Serializer):
    totp_required = serializers.BooleanField(default=True)
    setup_required = serializers.BooleanField()
    challenge_id = serializers.CharField()


class StaffTotpSetupRequestSerializer(serializers.Serializer):
    challenge_id = serializers.CharField(max_length=200)


class StaffTotpSetupResponseSerializer(serializers.Serializer):
    secret = serializers.CharField()
    otpauth_uri = serializers.CharField()
    qr_svg = serializers.CharField()


class StaffTotpVerifyRequestSerializer(serializers.Serializer):
    challenge_id = serializers.CharField(max_length=200)
    code = serializers.CharField(max_length=16, required=False, allow_blank=True, default="")
    recovery_code = serializers.CharField(
        max_length=32, required=False, allow_blank=True, default=""
    )


class StaffTotpSessionSerializer(serializers.Serializer):
    access_token = serializers.CharField()
    expires_in = serializers.IntegerField()
    user_type = serializers.CharField()
    recovery_codes = serializers.ListField(
        child=serializers.CharField(), required=False, allow_null=True
    )


class StaffSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(source="first_name", read_only=True)
    roles = serializers.SerializerMethodField()
    totp_enabled = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ["id", "username", "full_name", "is_active", "roles", "totp_enabled", "last_login"]
        read_only_fields = fields

    @staticmethod
    @extend_schema_field(_roles_field())
    def get_roles(user: User) -> list[str]:
        return roles_of(user)

    @staticmethod
    def get_totp_enabled(user: User) -> bool:
        totp = getattr(user, "totp", None)
        return bool(totp and totp.confirmed_at is not None)


class AdminMeShopSerializer(serializers.Serializer):
    id = serializers.UUIDField(read_only=True)
    name = serializers.CharField(read_only=True)


class AdminMeSerializer(StaffSerializer):
    """The signed-in staff member, with what they are allowed to do."""

    permissions = serializers.SerializerMethodField()
    shops = serializers.SerializerMethodField()

    class Meta(StaffSerializer.Meta):
        fields = [*StaffSerializer.Meta.fields, "permissions", "shops"]
        read_only_fields = fields

    @staticmethod
    @extend_schema_field(
        serializers.ListField(child=serializers.ChoiceField(choices=PERMISSION_CHOICES))
    )
    def get_permissions(user: User) -> list[str]:
        return permissions_of(user)

    @staticmethod
    @extend_schema_field(AdminMeShopSerializer(many=True))
    def get_shops(user: User) -> list[dict[str, str]]:
        from apps.shops.selectors import shops_for

        return [{"id": str(shop.id), "name": shop.name} for shop in shops_for(user)]


class StaffCreateSerializer(serializers.Serializer):
    username = serializers.RegexField(r"^[A-Za-z0-9._-]{3,30}$", max_length=30)
    full_name = serializers.CharField(max_length=150)
    password = serializers.CharField(max_length=128, trim_whitespace=False, write_only=True)
    roles = _roles_field(allow_empty=False)


class StaffUpdateSerializer(serializers.Serializer):
    """Send only what changes."""

    full_name = serializers.CharField(max_length=150, required=False)
    roles = _roles_field(required=False, allow_empty=False)
    is_active = serializers.BooleanField(required=False)


class RoleSerializer(serializers.Serializer):
    name = serializers.ChoiceField(choices=ROLE_CHOICES)
    permissions = serializers.ListField(child=serializers.ChoiceField(choices=PERMISSION_CHOICES))
