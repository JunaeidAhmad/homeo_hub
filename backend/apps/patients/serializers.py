from rest_framework import serializers

from apps.locations.models import Location
from apps.locations.serializers import LocationSerializer
from common.fields import PhoneField

from .models import Patient


def _password_field() -> serializers.CharField:
    return serializers.CharField(max_length=128, trim_whitespace=False, write_only=True)


class SignUpSerializer(serializers.Serializer):
    phone = PhoneField()
    password = _password_field()
    full_name = serializers.CharField(max_length=120)
    gender = serializers.ChoiceField(choices=Patient.Gender.choices)
    age = serializers.IntegerField(min_value=1, max_value=120)
    location_id = serializers.PrimaryKeyRelatedField(
        source="location", queryset=Location.objects.all(), pk_field=serializers.UUIDField()
    )


class VerifySerializer(serializers.Serializer):
    verification_id = serializers.UUIDField()
    code = serializers.CharField(max_length=12)


class LogInSerializer(serializers.Serializer):
    phone = PhoneField()
    password = _password_field()


class ForgotPasswordSerializer(serializers.Serializer):
    phone = PhoneField()


class ResetPasswordSerializer(VerifySerializer):
    new_password = _password_field()


class PatientSerializer(serializers.ModelSerializer):
    """The signed-in patient's own account."""

    age = serializers.IntegerField(read_only=True)
    location = LocationSerializer(read_only=True)
    phone_verified = serializers.BooleanField(source="is_phone_verified", read_only=True)
    user_type = serializers.ChoiceField(choices=["patient"], read_only=True)

    class Meta:
        model = Patient
        fields = [
            "id",
            "user_type",
            "phone",
            "phone_verified",
            "full_name",
            "gender",
            "date_of_birth",
            "age",
            "location",
            "preferred_language",
        ]
        read_only_fields = fields
