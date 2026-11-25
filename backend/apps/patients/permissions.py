from typing import Any

from rest_framework.permissions import BasePermission
from rest_framework.request import Request

from common.errors import ApiError

from .models import Patient


class PhoneNotVerified(ApiError):
    status_code = 403
    error_code = "PHONE_NOT_VERIFIED"
    default_detail = "Verify your phone number first."


class IsPatient(BasePermission):
    """A signed-in patient (not staff, not a doctor)."""

    def has_permission(self, request: Request, view: Any) -> bool:
        return isinstance(request.user, Patient)


class IsVerifiedPatient(BasePermission):
    """A patient whose phone is verified: required for checkout and consultations (BR-03)."""

    def has_permission(self, request: Request, view: Any) -> bool:
        if not isinstance(request.user, Patient):
            return False
        if not request.user.is_phone_verified:
            raise PhoneNotVerified()  # a code of its own, so the app can offer verification
        return True
