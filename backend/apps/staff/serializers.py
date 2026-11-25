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


class StaffSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(source="first_name", read_only=True)
    roles = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ["id", "username", "full_name", "is_active", "roles", "last_login"]
        read_only_fields = fields

    @staticmethod
    @extend_schema_field(_roles_field())
    def get_roles(user: User) -> list[str]:
        return roles_of(user)


class AdminMeSerializer(StaffSerializer):
    """The signed-in staff member, with what they are allowed to do."""

    permissions = serializers.SerializerMethodField()

    class Meta(StaffSerializer.Meta):
        fields = [*StaffSerializer.Meta.fields, "permissions"]
        read_only_fields = fields

    @staticmethod
    @extend_schema_field(
        serializers.ListField(child=serializers.ChoiceField(choices=PERMISSION_CHOICES))
    )
    def get_permissions(user: User) -> list[str]:
        return permissions_of(user)


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
