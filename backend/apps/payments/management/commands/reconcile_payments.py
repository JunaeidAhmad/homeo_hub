from django.core.management.base import BaseCommand

from apps.payments.services import reconcile_payments


class Command(BaseCommand):
    help = (
        "Check pending payments older than 30 minutes and expire unresolved ones after 60 minutes."
    )

    def handle(self, *args, **options) -> None:
        counts = reconcile_payments()
        self.stdout.write(
            f"Checked {counts['checked']} pending payments "
            f"(resolved={counts['resolved']}, expired={counts['expired']})."
        )
