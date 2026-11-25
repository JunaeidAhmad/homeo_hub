"""Sending text messages, behind a provider chosen by ``settings.SMS_PROVIDER``.

A real gateway (for production) is a class with the same ``send(to, message)``.
"""

import logging
from dataclasses import dataclass
from typing import ClassVar

from django.conf import settings
from django.utils.module_loading import import_string

from common.errors import ApiError

logger = logging.getLogger(__name__)


class SmsUnavailable(ApiError):
    status_code = 503
    error_code = "SMS_UNAVAILABLE"
    default_detail = "Text messages cannot be sent right now."


class ConsoleSmsProvider:
    """Development: writes the message (with its code) to the log. Never for real users."""

    def send(self, to: str, message: str) -> None:
        logger.info("SMS to %s: %s", to, message)


@dataclass(frozen=True)
class SentSms:
    to: str
    message: str


class MemorySmsProvider:
    """Tests: keeps messages in ``outbox``."""

    outbox: ClassVar[list[SentSms]] = []

    def send(self, to: str, message: str) -> None:
        self.outbox.append(SentSms(to, message))


class UnconfiguredSmsProvider:
    """The default outside development, until a real gateway is set up."""

    configured = False

    def send(self, to: str, message: str) -> None:
        raise SmsUnavailable()


def ensure_sms_configured() -> None:
    """Raise now if no gateway is set up, before doing anything that differs by number."""
    if not getattr(import_string(settings.SMS_PROVIDER), "configured", True):
        raise SmsUnavailable()


def send_sms(to: str, message: str) -> None:
    provider = import_string(settings.SMS_PROVIDER)()
    try:
        provider.send(to, message)
    except SmsUnavailable:
        raise
    except Exception as error:
        logger.exception("The SMS provider failed")
        raise SmsUnavailable() from error
