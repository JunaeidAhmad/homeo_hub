from django.core.management.base import BaseCommand

from apps.staff.services import seed_roles


class Command(BaseCommand):
    help = "Create the default staff roles and set their permissions. Safe to run repeatedly."

    def handle(self, *args, **options) -> None:
        seed_roles()
        self.stdout.write(self.style.SUCCESS("Staff roles are up to date."))
