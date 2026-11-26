from django.conf import settings
from django.utils.module_loading import import_string

from .base import PaymentGateway


def get_gateway() -> PaymentGateway:
    cls = import_string(settings.PAYMENT_GATEWAY)
    return cls()
