"""Reading shops scoped to the signed-in staff user."""

from typing import Any

from django.contrib.auth.models import User
from django.db.models import QuerySet

from apps.staff.roles import Perm

from .models import Shop


def shops_for(user: Any) -> QuerySet[Shop]:
    """Every shop a staff member may see or manage. Never leak other shops."""
    if not isinstance(user, User) or not user.is_authenticated:
        return Shop.objects.none()
    if user.has_perm(Perm.MANAGE_SHOPS.full):
        return Shop.objects.select_related("location").all()
    if user.has_perm(Perm.MANAGE_OWN_SHOP.full):
        return Shop.objects.select_related("location").filter(staff_links__user=user).distinct()
    return Shop.objects.none()
