import json

import pytest
from django.core.management import call_command
from django.db import IntegrityError, transaction

from apps.locations.models import Location


@pytest.mark.django_db
def test_seed_loads_the_whole_bangladesh_area_list():
    call_command("seed_locations")

    assert Location.objects.count() == 495
    assert Location.objects.values("division_en").distinct().count() == 8
    assert Location.objects.values("division_en", "district_en").distinct().count() == 64
    assert Location.objects.filter(
        division_en="Dhaka", district_en="Gazipur", upazila_en="Kapasia"
    ).exists()


@pytest.mark.django_db
def test_every_area_has_bangla_and_english_names():
    call_command("seed_locations")

    for field in ("division", "district", "upazila"):
        assert not Location.objects.filter(**{f"{field}_en": ""}).exists()
        assert not Location.objects.filter(**{f"{field}_bn": ""}).exists()


@pytest.mark.django_db
def test_seed_is_repeatable_and_restores_edited_names():
    call_command("seed_locations")
    first = Location.objects.get(division_en="Dhaka", district_en="Gazipur", upazila_en="Kapasia")
    Location.objects.filter(pk=first.pk).update(upazila_bn="ভুল")

    call_command("seed_locations")

    assert Location.objects.count() == 495
    restored = Location.objects.get(pk=first.pk)  # same row, not a duplicate
    # Stored in one canonical Unicode form (NFC): য় is য + nukta, never the single
    # code point U+09DF, so what people type always matches what is stored.
    assert restored.upazila_bn == f"কাপাসি{chr(0x09AF) + chr(0x09BC)}া"


@pytest.mark.django_db
def test_an_area_cannot_appear_twice():
    area = {"division_en": "Dhaka", "district_en": "Gazipur", "upazila_en": "Kapasia"}
    Location.objects.create(**area, division_bn="ঢাকা", district_bn="গাজীপুর", upazila_bn="কাপাসিয়া")

    with pytest.raises(IntegrityError), transaction.atomic():
        Location.objects.create(**area, division_bn="ঢাকা", district_bn="গাজীপুর", upazila_bn="কাপাসিয়া")


def test_the_bundled_area_file_has_no_duplicate_areas():
    from apps.locations.management.commands.seed_locations import DEFAULT_FILE

    rows = json.loads(DEFAULT_FILE.read_text(encoding="utf-8"))
    keys = [(r["division_en"], r["district_en"], r["upazila_en"]) for r in rows]

    assert len(keys) == len(set(keys)) == 495
