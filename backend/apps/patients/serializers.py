from typing import Any

from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from apps.locations.models import Location
from apps.locations.serializers import LocationSerializer
from common.fields import PhoneField

from .models import Patient, PatientProfile, profile_completeness


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


@extend_schema_field({"type": "string", "format": "uri", "nullable": True})
class ProfilePictureUrlField(serializers.Field):
    """The profile picture's full URL, or null."""

    def __init__(self, **kwargs: Any) -> None:
        super().__init__(source="*", read_only=True, **kwargs)

    def to_representation(self, profile: PatientProfile) -> str | None:
        if not profile.picture:
            return None
        url = profile.picture.url
        request = self.context.get("request")
        return request.build_absolute_uri(url) if request else url


class CompletenessSectionsSerializer(serializers.Serializer):
    picture = serializers.BooleanField()
    basic = serializers.BooleanField()
    family_history = serializers.BooleanField()
    medical_history = serializers.BooleanField()
    mental_picture = serializers.BooleanField()
    general_picture = serializers.BooleanField()
    likes_dislikes = serializers.BooleanField()


class ProfileCompletenessSerializer(serializers.Serializer):
    filled = serializers.IntegerField()
    total = serializers.IntegerField()
    sections = CompletenessSectionsSerializer()


class PatientProfileSerializer(serializers.ModelSerializer):
    id = serializers.UUIDField(source="patient.id", read_only=True)
    phone = serializers.CharField(source="patient.phone", read_only=True)
    phone_verified = serializers.BooleanField(source="patient.is_phone_verified", read_only=True)
    full_name = serializers.CharField(source="patient.full_name", read_only=True)
    gender = serializers.ChoiceField(
        source="patient.gender", choices=Patient.Gender.choices, read_only=True
    )
    age = serializers.IntegerField(source="patient.age", read_only=True)
    location = LocationSerializer(source="patient.location", read_only=True)
    picture_url = ProfilePictureUrlField()
    completeness = serializers.SerializerMethodField()

    class Meta:
        model = PatientProfile
        fields = [
            "id",
            "phone",
            "phone_verified",
            "full_name",
            "gender",
            "age",
            "location",
            "picture_url",
            "blood_group",
            "height_cm",
            "weight_kg",
            "marital_status",
            "occupation",
            "family_conditions",
            "family_notes",
            "chronic_conditions",
            "current_medications",
            "allergies",
            "temperament",
            "fears_anxieties",
            "emotional_notes",
            "thermal_preference",
            "appetite_thirst",
            "sleep_dreams",
            "general_notes",
            "food_cravings",
            "food_aversions",
            "weather_modalities",
            "completeness",
            "updated_at",
        ]
        read_only_fields = fields

    @extend_schema_field(ProfileCompletenessSerializer)
    def get_completeness(self, profile: PatientProfile) -> dict[str, Any]:
        return profile_completeness(profile)


class PatientProfileBasicUpdateSerializer(serializers.Serializer):
    full_name = serializers.CharField(max_length=120, required=False)
    gender = serializers.ChoiceField(choices=Patient.Gender.choices, required=False)
    age = serializers.IntegerField(min_value=1, max_value=120, required=False)
    location_id = serializers.PrimaryKeyRelatedField(
        source="location",
        queryset=Location.objects.all(),
        pk_field=serializers.UUIDField(),
        required=False,
    )
    blood_group = serializers.ChoiceField(
        choices=PatientProfile.BloodGroup.choices, allow_blank=True, required=False
    )
    height_cm = serializers.IntegerField(
        min_value=30, max_value=250, allow_null=True, required=False
    )
    weight_kg = serializers.DecimalField(
        max_digits=5,
        decimal_places=1,
        min_value=1,
        max_value=300,
        allow_null=True,
        required=False,
    )
    marital_status = serializers.ChoiceField(
        choices=PatientProfile.MaritalStatus.choices, allow_blank=True, required=False
    )
    occupation = serializers.CharField(max_length=120, allow_blank=True, required=False)


class PatientProfileSectionUpdateSerializer(serializers.Serializer):
    family_conditions = serializers.CharField(max_length=4000, allow_blank=True, required=False)
    family_notes = serializers.CharField(max_length=4000, allow_blank=True, required=False)
    chronic_conditions = serializers.CharField(max_length=4000, allow_blank=True, required=False)
    current_medications = serializers.CharField(max_length=4000, allow_blank=True, required=False)
    allergies = serializers.CharField(max_length=4000, allow_blank=True, required=False)
    temperament = serializers.CharField(max_length=4000, allow_blank=True, required=False)
    fears_anxieties = serializers.CharField(max_length=4000, allow_blank=True, required=False)
    emotional_notes = serializers.CharField(max_length=4000, allow_blank=True, required=False)
    thermal_preference = serializers.ChoiceField(
        choices=PatientProfile.ThermalPreference.choices, allow_blank=True, required=False
    )
    appetite_thirst = serializers.CharField(max_length=4000, allow_blank=True, required=False)
    sleep_dreams = serializers.CharField(max_length=4000, allow_blank=True, required=False)
    general_notes = serializers.CharField(max_length=4000, allow_blank=True, required=False)
    food_cravings = serializers.CharField(max_length=4000, allow_blank=True, required=False)
    food_aversions = serializers.CharField(max_length=4000, allow_blank=True, required=False)
    weather_modalities = serializers.CharField(max_length=4000, allow_blank=True, required=False)


class PatientProfilePictureUploadSerializer(serializers.Serializer):
    picture = serializers.ImageField()
