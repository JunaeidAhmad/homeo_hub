from getpass import getpass

from django.core.management.base import BaseCommand, CommandError, CommandParser
from rest_framework.exceptions import ValidationError

from apps.staff import services
from apps.staff.roles import Role
from common.errors import ApiError


class Command(BaseCommand):
    help = "Create a staff account, e.g. the first super admin. Asks for the password."

    def add_arguments(self, parser: CommandParser) -> None:
        parser.add_argument("username")
        parser.add_argument("--name", default="", help="Full name (default: the username)")
        parser.add_argument(
            "--role",
            action="append",
            choices=[role.value for role in Role],
            help="Repeat for several roles (default: super_admin)",
        )

    def handle(self, *args, **options) -> None:
        password = getpass("Password: ")
        if password != getpass("Password again: "):
            raise CommandError("The two passwords differ.")
        services.seed_roles()
        try:
            user = services.create_staff(
                username=options["username"],
                full_name=options["name"] or options["username"],
                password=password,
                roles=options["role"] or [Role.SUPER_ADMIN.value],
            )
        except ValidationError as error:
            problems = [str(p) for found in error.detail.values() for p in found]  # type: ignore[union-attr]
            raise CommandError(" ".join(problems)) from error
        except ApiError as error:
            raise CommandError(str(error.detail)) from error
        self.stdout.write(self.style.SUCCESS(f"Created staff account {user.username!r}."))
