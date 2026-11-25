"""Patients have their own table and their own sign-in, apart from staff users."""

import uuid
from datetime import date

from django.contrib.auth.hashers import check_password, make_password
from django.db import models
from django.utils import timezone


class Patient(models.Model):
    class Gender(models.TextChoices):
        FEMALE = "FEMALE"
        MALE = "MALE"
        OTHER = "OTHER"

    class Language(models.TextChoices):
        ENGLISH = "en"
        BANGLA = "bn"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    phone = models.CharField(max_length=14, unique=True)  # +8801XXXXXXXXX
    password = models.CharField(max_length=128)
    full_name = models.CharField(max_length=120)
    gender = models.CharField(max_length=10, choices=Gender.choices)
    # Approximate when worked out from the age given at sign-up.
    date_of_birth = models.DateField()
    location = models.ForeignKey(
        "locations.Location", on_delete=models.PROTECT, related_name="patients"
    )
    preferred_language = models.CharField(
        max_length=2, choices=Language.choices, default=Language.ENGLISH
    )
    phone_verified_at = models.DateTimeField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    last_login_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    user_type = "patient"
    # What DRF and Django expect of ``request.user``.
    is_authenticated = True
    is_anonymous = False

    def __str__(self) -> str:
        return f"{self.full_name} ({self.phone})"

    def set_password(self, raw: str) -> None:
        self.password = make_password(raw)

    def check_password(self, raw: str) -> bool:
        return check_password(raw, self.password)

    @property
    def is_phone_verified(self) -> bool:
        return self.phone_verified_at is not None

    @property
    def age(self) -> int:
        return years_between(self.date_of_birth, timezone.localdate())


def years_between(born: date, today: date) -> int:
    return today.year - born.year - ((today.month, today.day) < (born.month, born.day))


def date_of_birth_for_age(age: int, today: date) -> date:
    """The same day ``age`` years ago (28 February if today is the 29th)."""
    try:
        return today.replace(year=today.year - age)
    except ValueError:
        return today.replace(year=today.year - age, day=28)
