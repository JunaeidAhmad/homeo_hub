from rest_framework import serializers

from apps.locations.models import Location
from apps.locations.serializers import LocationSerializer
from common.fields import PhoneField
from common.private_files import signed_link

from .models import Doctor, DoctorCertificate


class DoctorSignUpSerializer(serializers.Serializer):
    phone = PhoneField()
    password = serializers.CharField(max_length=128, trim_whitespace=False, write_only=True)
    full_name = serializers.CharField(max_length=120)
    registration_no = serializers.CharField(max_length=80)
    qualifications = serializers.CharField(max_length=2000)
    experience_years = serializers.IntegerField(min_value=0, max_value=80)
    location_id = serializers.PrimaryKeyRelatedField(
        queryset=Location.objects.all(), source="location"
    )
    chamber_address = serializers.CharField(max_length=300)
    requested_fee_poisha = serializers.IntegerField(min_value=1, max_value=10_000_000)


class DoctorCertificateSerializer(serializers.ModelSerializer):
    url = serializers.SerializerMethodField()

    class Meta:
        model = DoctorCertificate
        fields = ["id", "original_name", "content_type", "size", "uploaded_at", "url"]
        read_only_fields = fields

    def get_url(self, cert: DoctorCertificate) -> str:
        return signed_link(self.context.get("request"), cert.file, minutes=5)


class DoctorMeSerializer(serializers.ModelSerializer):
    location = LocationSerializer(read_only=True)
    certificates = DoctorCertificateSerializer(many=True, read_only=True)

    class Meta:
        model = Doctor
        fields = [
            "id",
            "doctor_code",
            "phone",
            "full_name",
            "registration_no",
            "qualifications",
            "experience_years",
            "location",
            "chamber_address",
            "requested_fee_poisha",
            "consultation_fee_poisha",
            "status",
            "rejection_reason",
            "suspension_reason",
            "preferred_language",
            "submitted_at",
            "approved_at",
            "certificates",
        ]
        read_only_fields = fields


class DoctorApplicationUpdateSerializer(serializers.Serializer):
    full_name = serializers.CharField(max_length=120, required=False)
    registration_no = serializers.CharField(max_length=80, required=False)
    qualifications = serializers.CharField(max_length=2000, required=False)
    experience_years = serializers.IntegerField(min_value=0, max_value=80, required=False)
    location_id = serializers.PrimaryKeyRelatedField(
        queryset=Location.objects.all(), source="location", required=False
    )
    chamber_address = serializers.CharField(max_length=300, required=False)
    requested_fee_poisha = serializers.IntegerField(
        min_value=1, max_value=10_000_000, required=False
    )


class CertificateUploadSerializer(serializers.Serializer):
    file = serializers.FileField()


class AdminDoctorSummarySerializer(serializers.ModelSerializer):
    area = serializers.SerializerMethodField()

    class Meta:
        model = Doctor
        fields = [
            "id",
            "doctor_code",
            "full_name",
            "registration_no",
            "area",
            "requested_fee_poisha",
            "consultation_fee_poisha",
            "status",
            "submitted_at",
        ]

    def get_area(self, doctor: Doctor) -> str:
        return f"{doctor.location.upazila_en}, {doctor.location.district_en}"


class AdminDoctorDetailSerializer(DoctorMeSerializer):
    approved_by_name = serializers.SerializerMethodField()
    rejected_by_name = serializers.SerializerMethodField()
    suspended_by_name = serializers.SerializerMethodField()

    class Meta(DoctorMeSerializer.Meta):
        fields = [
            *DoctorMeSerializer.Meta.fields,
            "approved_by_name",
            "rejected_at",
            "rejected_by_name",
            "suspended_at",
            "suspended_by_name",
        ]

    def get_approved_by_name(self, doctor: Doctor) -> str | None:
        if doctor.approved_by:
            return doctor.approved_by.first_name or doctor.approved_by.username
        return None

    def get_rejected_by_name(self, doctor: Doctor) -> str | None:
        if doctor.rejected_by:
            return doctor.rejected_by.first_name or doctor.rejected_by.username
        return None

    def get_suspended_by_name(self, doctor: Doctor) -> str | None:
        if doctor.suspended_by:
            return doctor.suspended_by.first_name or doctor.suspended_by.username
        return None


class AdminDoctorApproveSerializer(serializers.Serializer):
    consultation_fee_poisha = serializers.IntegerField(min_value=1, max_value=10_000_000)


class AdminDoctorReasonSerializer(serializers.Serializer):
    reason = serializers.CharField(max_length=1000, allow_blank=False)


class AdminDoctorFeeUpdateSerializer(serializers.Serializer):
    consultation_fee_poisha = serializers.IntegerField(min_value=1, max_value=10_000_000)
