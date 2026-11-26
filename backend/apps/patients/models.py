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


class PatientProfile(models.Model):
    """Patient portrait, extended basic details, and homeopathic clinical history."""

    class BloodGroup(models.TextChoices):
        A_POS = "A+", "A+"
        A_NEG = "A-", "A-"
        B_POS = "B+", "B+"
        B_NEG = "B-", "B-"
        AB_POS = "AB+", "AB+"
        AB_NEG = "AB-", "AB-"
        O_POS = "O+", "O+"
        O_NEG = "O-", "O-"

    class MaritalStatus(models.TextChoices):
        SINGLE = "SINGLE"
        MARRIED = "MARRIED"
        WIDOWED = "WIDOWED"
        DIVORCED = "DIVORCED"

    class ThermalPreference(models.TextChoices):
        CHILLY = "CHILLY"
        HOT = "HOT"
        AMBIVALENT = "AMBIVALENT"

    patient = models.OneToOneField(
        Patient,
        on_delete=models.CASCADE,
        primary_key=True,
        related_name="profile",
    )
    picture = models.ImageField(upload_to="patients/", blank=True)

    blood_group = models.CharField(max_length=5, choices=BloodGroup.choices, blank=True, default="")
    height_cm = models.PositiveSmallIntegerField(null=True, blank=True)
    weight_kg = models.DecimalField(max_digits=5, decimal_places=1, null=True, blank=True)
    marital_status = models.CharField(
        max_length=12, choices=MaritalStatus.choices, blank=True, default=""
    )
    occupation = models.CharField(max_length=120, blank=True, default="")

    family_conditions = models.TextField(blank=True, default="")
    family_notes = models.TextField(blank=True, default="")

    chronic_conditions = models.TextField(blank=True, default="")
    current_medications = models.TextField(blank=True, default="")
    allergies = models.TextField(blank=True, default="")

    temperament = models.TextField(blank=True, default="")
    fears_anxieties = models.TextField(blank=True, default="")
    emotional_notes = models.TextField(blank=True, default="")

    thermal_preference = models.CharField(
        max_length=12, choices=ThermalPreference.choices, blank=True, default=""
    )
    appetite_thirst = models.TextField(blank=True, default="")
    sleep_dreams = models.TextField(blank=True, default="")
    general_notes = models.TextField(blank=True, default="")

    food_cravings = models.TextField(blank=True, default="")
    food_aversions = models.TextField(blank=True, default="")
    weather_modalities = models.TextField(blank=True, default="")

    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return f"Profile for {self.patient.full_name}"


SECTION_FIELDS: dict[str, tuple[str, ...]] = {
    "family_history": ("family_conditions", "family_notes"),
    "medical_history": ("chronic_conditions", "current_medications", "allergies"),
    "mental_picture": ("temperament", "fears_anxieties", "emotional_notes"),
    "general_picture": (
        "thermal_preference",
        "appetite_thirst",
        "sleep_dreams",
        "general_notes",
    ),
    "likes_dislikes": ("food_cravings", "food_aversions", "weather_modalities"),
}


def profile_completeness(profile: PatientProfile) -> dict[str, object]:
    """Return completeness counts and booleans across all 7 profile areas."""
    basic_filled = any(
        [
            bool(profile.blood_group),
            profile.height_cm is not None,
            profile.weight_kg is not None,
            bool(profile.marital_status),
            bool(profile.occupation.strip()),
        ]
    )
    sections: dict[str, bool] = {
        "picture": bool(profile.picture),
        "basic": basic_filled,
    }
    for key, fields in SECTION_FIELDS.items():
        sections[key] = any(bool(str(getattr(profile, field, "")).strip()) for field in fields)
    filled = sum(1 for done in sections.values() if done)
    return {"filled": filled, "total": len(sections), "sections": sections}
