"""Pluggable video provider protocol and default pasted-link implementation."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any, Protocol

from django.conf import settings
from django.utils.module_loading import import_string

if TYPE_CHECKING:
    from .models import VideoAppointment


class VideoProvider(Protocol):
    def prepare(self, appointment: VideoAppointment) -> None: ...

    def join_url(self, appointment: VideoAppointment, principal: Any) -> str: ...


class PastedLinkProvider:
    """Uses the external meeting link saved by the doctor on the appointment."""

    def prepare(self, appointment: VideoAppointment) -> None:
        return None

    def join_url(self, appointment: VideoAppointment, principal: Any) -> str:
        return appointment.meeting_link


def get_video_provider() -> VideoProvider:
    path = getattr(settings, "VIDEO_PROVIDER", "apps.telemedicine.video.PastedLinkProvider")
    cls = import_string(path)
    return cls()  # type: ignore[no-any-return]
