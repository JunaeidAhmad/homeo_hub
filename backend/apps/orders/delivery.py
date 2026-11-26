"""Delivery charge calculation. Flat fee for now; zone rules can replace this later."""

from django.conf import settings

from apps.locations.models import Location


def delivery_charge_for(location: Location) -> int:
    _ = location
    return int(settings.DELIVERY_CHARGE_POISHA)
