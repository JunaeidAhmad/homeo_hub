"""Every admin endpoint says which permission each method needs; anything unsaid is refused."""

from typing import Any, Literal

from django.contrib.auth.models import User
from rest_framework.permissions import BasePermission
from rest_framework.request import Request
from rest_framework.views import APIView

from .roles import Perm

# For the few endpoints every signed-in staff member may use.
ANY_STAFF: Literal["any_staff"] = "any_staff"
Requirement = Perm | tuple[Perm, ...] | Literal["any_staff"]


def is_staff_member(user: Any) -> bool:
    return isinstance(user, User) and user.is_active and user.is_staff


class StaffAccess(BasePermission):
    message = "You do not have permission to do that."

    def has_permission(self, request: Request, view: Any) -> bool:
        if not is_staff_member(request.user):
            return False
        needed: Requirement | None = view.required_permissions.get(request.method)
        if needed is None:
            return False  # a method nobody declared is closed to everyone
        if needed == ANY_STAFF:
            return True
        perms = needed if isinstance(needed, tuple) else (needed,)
        return any(request.user.has_perm(Perm(perm).full) for perm in perms)


class AdminView(APIView):
    """The base of every view under ``/api/v1/admin/`` (list it before a generic view)::

    class RemedyList(AdminView, ListCreateAPIView):
        required_permissions = {"GET": Perm.MANAGE_REMEDIES, "POST": Perm.MANAGE_REMEDIES}

    A value in ``required_permissions`` may be a single ``Perm``, a ``tuple[Perm, ...]``
    (any one of them grants access), or ``ANY_STAFF``.
    """

    permission_classes = [StaffAccess]
    required_permissions: dict[str, Requirement] = {}
