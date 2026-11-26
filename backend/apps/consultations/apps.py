from django.apps import AppConfig


class ConsultationsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.consultations"

    def ready(self) -> None:
        from .signals import connect_signals

        connect_signals()
