import json
from pathlib import Path

from django.core.management.base import BaseCommand, CommandParser
from django.db import transaction

from apps.locations.models import Location
from apps.locations.spellings import old_spellings_of
from common.search import normalize_text

DEFAULT_FILE = Path(__file__).resolve().parents[2] / "data" / "bd_locations.json"
ENGLISH = ["division_en", "district_en", "upazila_en"]
BANGLA = ["division_bn", "district_bn", "upazila_bn"]


class Command(BaseCommand):
    help = (
        "Load the Bangladesh area list (division, district, upazila or city thana). "
        "Safe to run repeatedly."
    )

    def add_arguments(self, parser: CommandParser) -> None:
        parser.add_argument("--file", type=Path, default=DEFAULT_FILE, help="JSON file to load")

    @transaction.atomic
    def handle(self, *args, **options) -> None:
        rows = [
            # One canonical Unicode form, so searches match however a keyboard types Bangla.
            {field: normalize_text(value) for field, value in row.items()}
            for row in json.loads(options["file"].read_text(encoding="utf-8"))
        ]
        for row in rows:
            row.setdefault("kind", Location.Kind.UPAZILA)
        self._give_codes_to_uncoded_areas(rows)
        Location.objects.bulk_create(
            [
                Location(**row, old_spellings=old_spellings_of([row[f] for f in ENGLISH]))
                for row in rows
            ],
            update_conflicts=True,
            unique_fields=["code"],
            update_fields=[*ENGLISH, *BANGLA, "kind", "old_spellings"],
        )
        self.stdout.write(self.style.SUCCESS(f"{len(rows)} locations loaded."))

    def _give_codes_to_uncoded_areas(self, rows: list[dict]) -> None:
        """Areas loaded before codes existed are matched by name once, keeping their ids."""
        codes = {tuple(row[f] for f in ENGLISH): row["code"] for row in rows}
        uncoded = list(Location.objects.filter(code__isnull=True))
        for area in uncoded:
            area.code = codes.get(tuple(getattr(area, f) for f in ENGLISH))
        Location.objects.bulk_update(uncoded, ["code"])
