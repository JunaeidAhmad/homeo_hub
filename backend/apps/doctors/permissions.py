from typing import Any

from rest_framework.permissions import BasePermission
from rest_framework.request import Request

from common.errors import ApiError

from .models import Doctor


class DoctorNotApproved(ApiError):
    status_code = 403
    error_code = "DOCTOR_NOT_APPROVED"
    default_detail = "Your doctor application is not approved yet."


class IsDoctor(BasePermission):
    """Any signed-in doctor (including pending or rejected viewing their application)."""

    def has_permission(self, request: Request, view: Any) -> bool:
        return isinstance(request.user, Doctor) and request.user.status != Doctor.Status.SUSPENDED


class IsApprovedDoctor(BasePermission):
    """Only an approved doctor may open cases or prescribe."""

    def has_permission(self, request: Request, view: Any) -> bool:
        if not isinstance(request.user, Doctor):
            return False
        if not request.user.is_approved:
            raise DoctorNotApproved()
        return True
