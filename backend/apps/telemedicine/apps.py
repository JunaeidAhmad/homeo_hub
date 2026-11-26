from django.apps import AppConfig


class TelemedicineConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.telemedicine"

    def ready(self) -> None:
        from apps.notifications.due import DUE_CHECKS

        from .reminders import appointment_reminders

        if appointment_reminders not in DUE_CHECKS:
            DUE_CHECKS.append(appointment_reminders)
