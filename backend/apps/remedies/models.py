"""A remedy is the medicine itself. Prices (ticket 07) and shop stock live elsewhere."""

import uuid

from django.db import models
from django.db.models.functions import Lower

from .choices import RemedyForm


class Remedy(models.Model):
    class Status(models.TextChoices):
        DRAFT = "DRAFT"  # being written; staff only
        ACTIVE = "ACTIVE"  # shown to patients
        ARCHIVED = "ARCHIVED"  # withdrawn; kept for past orders

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=150)  # Latin, e.g. Arsenicum album
    name_bn = models.CharField(max_length=150, blank=True, default="")
    slug = models.SlugField(max_length=160, unique=True)

    # English is required; Bangla may be empty and then English is shown.
    description_en = models.TextField()
    description_bn = models.TextField(blank=True, default="")
    indication_en = models.TextField()  # "when to use"
    indication_bn = models.TextField(blank=True, default="")
    advice_do_en = models.TextField()  # one piece of advice per line
    advice_do_bn = models.TextField(blank=True, default="")
    advice_dont_en = models.TextField()
    advice_dont_bn = models.TextField(blank=True, default="")

    picture = models.ImageField(upload_to="remedies/", blank=True)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.DRAFT)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]
        constraints = [
            models.UniqueConstraint(Lower("name"), name="remedy_name_unique_any_case"),
        ]
        indexes = [models.Index(fields=["status"], name="remedy_status")]

    def __str__(self) -> str:
        return self.name


class RemedyPrice(models.Model):
    """Patient price for one remedy in one form (pill or liquid), in integer poisha."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    remedy = models.ForeignKey(Remedy, on_delete=models.CASCADE, related_name="prices")
    form = models.CharField(max_length=10, choices=RemedyForm.choices)
    price_poisha = models.PositiveIntegerField()
    is_active = models.BooleanField(default=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["form"]
        constraints = [
            models.UniqueConstraint(fields=["remedy", "form"], name="remedy_price_one_per_form"),
            models.CheckConstraint(
                condition=models.Q(price_poisha__gt=0),
                name="remedy_price_positive",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.remedy.name} ({self.form}): {self.price_poisha}"
