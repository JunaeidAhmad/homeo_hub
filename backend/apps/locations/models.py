import uuid

from django.db import models


class Location(models.Model):
    """One area of Bangladesh: division → district → upazila / thana, in English and Bangla."""

    class Kind(models.TextChoices):
        UPAZILA = "UPAZILA"  # an upazila (rural thana)
        CITY_THANA = "CITY_THANA"  # a metropolitan police thana inside a city

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    # Stable identity from the seed file, so re-seeding can respell an area in place.
    code = models.CharField(max_length=20, unique=True, null=True, blank=True)

    division_en = models.CharField(max_length=100)
    division_bn = models.CharField(max_length=100)
    district_en = models.CharField(max_length=100)
    district_bn = models.CharField(max_length=100)
    upazila_en = models.CharField(max_length=100)
    upazila_bn = models.CharField(max_length=100)
    kind = models.CharField(max_length=10, choices=Kind.choices, default=Kind.UPAZILA)
    # Earlier English spellings (Comilla for Cumilla), so searching them still works.
    old_spellings = models.CharField(max_length=300, blank=True, default="")

    class Meta:
        ordering = ["division_en", "district_en", "upazila_en"]
        constraints = [
            models.UniqueConstraint(
                fields=["division_en", "district_en", "upazila_en"],
                name="location_area_is_unique",
            )
        ]

    def __str__(self) -> str:
        return f"{self.upazila_en}, {self.district_en}, {self.division_en}"
