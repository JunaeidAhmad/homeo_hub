import json
from pathlib import Path

from django.core.management.base import BaseCommand, CommandParser

from apps.locations.models import Location
from common.search import normalize_text

DEFAULT_FILE = Path(__file__).resolve().parents[2] / "data" / "bd_locations.json"
KEY = ["division_en", "district_en", "upazila_en"]
NAMES = ["division_bn", "district_bn", "upazila_bn"]


class Command(BaseCommand):
    help = "Load the Bangladesh area list (division, district, upazila). Safe to run repeatedly."

    def add_arguments(self, parser: CommandParser) -> None:
        parser.add_argument("--file", type=Path, default=DEFAULT_FILE, help="JSON file to load")

    def handle(self, *args, **options) -> None:
        rows = [
            # One canonical Unicode form, so searches match however a keyboard types Bangla.
            {field: normalize_text(name) for field, name in row.items()}
            for row in json.loads(options["file"].read_text(encoding="utf-8"))
        ]
        Location.objects.bulk_create(
            [Location(**row) for row in rows],
            update_conflicts=True,
            unique_fields=KEY,
            update_fields=NAMES,
        )
        self.stdout.write(self.style.SUCCESS(f"{len(rows)} locations loaded."))
