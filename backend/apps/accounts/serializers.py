from rest_framework import serializers

from common.fields import PhoneField

from .models import OtpChallenge
from .otp import CODE_LIFETIME, RESEND_AFTER_SECONDS
from .tokens import Session


class LogInSerializer(serializers.Serializer):
    """Everyone signs in the same way: mobile number and password."""

    phone = PhoneField()
    password = serializers.CharField(max_length=128, trim_whitespace=False, write_only=True)


class VerificationSerializer(serializers.Serializer):
    """A code has been requested; send it back with ``verification_id``."""

    verification_id = serializers.UUIDField()
    phone = serializers.CharField()
    expires_in = serializers.IntegerField(help_text="Seconds until the code stops working.")
    resend_after = serializers.IntegerField(help_text="Seconds to wait before offering a resend.")

    @staticmethod
    def describe(challenge: OtpChallenge) -> dict:
        return {
            "verification_id": challenge.pk,
            "phone": challenge.phone,
            "expires_in": int(CODE_LIFETIME.total_seconds()),
            "resend_after": RESEND_AFTER_SECONDS,
        }


class ResendSerializer(serializers.Serializer):
    verification_id = serializers.UUIDField()


class VerifyCodeSerializer(serializers.Serializer):
    verification_id = serializers.UUIDField()
    code = serializers.CharField(max_length=12)


class SessionSerializer(serializers.Serializer):
    """Signed in. Keep the access token in memory; the refresh token is set as a cookie."""

    access_token = serializers.CharField()
    expires_in = serializers.IntegerField()
    user_type = serializers.ChoiceField(choices=["patient", "staff", "doctor"])

    @staticmethod
    def describe(session: Session) -> dict:
        return {
            "access_token": session.access_token,
            "expires_in": session.expires_in,
            "user_type": session.user_type,
        }
