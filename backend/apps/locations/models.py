import uuid

from django.db import models


class Location(models.Model):
    """One area of Bangladesh: division → district → upazila / thana, in English and Bangla."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    division_en = models.CharField(max_length=100)
    division_bn = models.CharField(max_length=100)
    district_en = models.CharField(max_length=100)
    district_bn = models.CharField(max_length=100)
    upazila_en = models.CharField(max_length=100)
    upazila_bn = models.CharField(max_length=100)

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
