from django.contrib.auth.models import User
from django.core.management.base import BaseCommand, CommandError, CommandParser

from common.phone import InvalidPhone, normalize_phone


class Command(BaseCommand):
    help = "Change the mobile number a staff account signs in with."

    def add_arguments(self, parser: CommandParser) -> None:
        parser.add_argument("account", help="Its current sign-in name or number, as stored")
        parser.add_argument("phone", help="The new mobile number")

    def handle(self, *args, **options) -> None:
        user = User.objects.filter(username__iexact=options["account"], is_staff=True).first()
        if user is None:
            raise CommandError("There is no such staff account.")
        try:
            phone = normalize_phone(options["phone"])
        except InvalidPhone as error:
            raise CommandError("Enter a Bangladeshi mobile number.") from error
        if User.objects.filter(username=phone).exclude(pk=user.pk).exists():
            raise CommandError("Another account already uses that number.")
        user.username = phone
        user.save(update_fields=["username"])
        self.stdout.write(
            self.style.SUCCESS(f"{user.first_name or phone} now signs in with {phone}.")
        )
