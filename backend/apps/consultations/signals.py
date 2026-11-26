from typing import Any

from apps.doctors.models import Doctor
from apps.doctors.signals import doctor_suspended


def _on_doctor_suspended(sender: type[Doctor], doctor: Doctor, **kwargs: Any) -> None:
    from .services import return_to_queue

    return_to_queue(doctor)


def connect_signals() -> None:
    doctor_suspended.connect(
        _on_doctor_suspended,
        sender=Doctor,
        dispatch_uid="consultations.return_on_doctor_suspended",
    )
