"""Illness library and ranked remedies for self-care."""

import uuid

from django.db import models


class IllnessCategory(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name_en = models.CharField(max_length=150)
    name_bn = models.CharField(max_length=150, blank=True, default="")
    slug = models.SlugField(max_length=160, unique=True)
    sort_order = models.PositiveSmallIntegerField(default=0)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["sort_order", "name_en"]

    def __str__(self) -> str:
        return self.name_en


class Illness(models.Model):
    class Status(models.TextChoices):
        ACTIVE = "ACTIVE"
        INACTIVE = "INACTIVE"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    category = models.ForeignKey(
        IllnessCategory, on_delete=models.PROTECT, related_name="illnesses"
    )
    name_en = models.CharField(max_length=150)
    name_bn = models.CharField(max_length=150, blank=True, default="")
    slug = models.SlugField(max_length=160, unique=True)
    short_description_en = models.TextField()
    short_description_bn = models.TextField(blank=True, default="")
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.INACTIVE)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name_en"]
        indexes = [models.Index(fields=["status"], name="illness_status")]

    def __str__(self) -> str:
        return self.name_en


class IllnessRemedy(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    illness = models.ForeignKey(Illness, on_delete=models.CASCADE, related_name="ranked_remedies")
    remedy = models.ForeignKey("remedies.Remedy", on_delete=models.PROTECT)
    rank = models.PositiveSmallIntegerField()

    class Meta:
        ordering = ["rank"]
        constraints = [
            models.UniqueConstraint(
                fields=["illness", "remedy"],
                name="illness_remedy_unique_pair",
            ),
            models.UniqueConstraint(
                fields=["illness", "rank"],
                deferrable=models.Deferrable.DEFERRED,
                name="illness_remedy_unique_rank",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.illness.name_en} #{self.rank}: {self.remedy.name}"
