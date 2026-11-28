from getpass import getpass

from django.core.management.base import BaseCommand, CommandError, CommandParser
from rest_framework.exceptions import ValidationError

from apps.staff import services
from apps.staff.roles import Role
from common.errors import ApiError
from common.phone import InvalidPhone


class Command(BaseCommand):
    help = "Create a staff account, e.g. the first super admin. Asks for the password."

    def add_arguments(self, parser: CommandParser) -> None:
        parser.add_argument("phone", help="Mobile number they sign in with")
        parser.add_argument("--name", default="", help="Full name (default: the number)")
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
                phone=options["phone"],
                full_name=options["name"] or options["phone"],
                password=password,
                roles=options["role"] or [Role.SUPER_ADMIN.value],
            )
        except InvalidPhone as error:
            raise CommandError("Enter a Bangladeshi mobile number.") from error
        except ValidationError as error:
            problems = [str(p) for found in error.detail.values() for p in found]  # type: ignore[union-attr]
            raise CommandError(" ".join(problems)) from error
        except ApiError as error:
            raise CommandError(str(error.detail)) from error
        self.stdout.write(self.style.SUCCESS(f"Created staff account {user.username!r}."))
