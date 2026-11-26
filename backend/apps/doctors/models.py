"""Doctors have their own table, approval workflow, and private credential files."""

import uuid

from django.conf import settings
from django.contrib.auth.hashers import check_password, make_password
from django.db import models


class Doctor(models.Model):
    class Status(models.TextChoices):
        PENDING_APPROVAL = "PENDING_APPROVAL"
        APPROVED = "APPROVED"
        REJECTED = "REJECTED"
        SUSPENDED = "SUSPENDED"

    class Language(models.TextChoices):
        ENGLISH = "en"
        BANGLA = "bn"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    doctor_code = models.CharField(max_length=20, unique=True, null=True, blank=True)  # noqa: DJ001
    phone = models.CharField(max_length=14, unique=True)
    password = models.CharField(max_length=128)
    full_name = models.CharField(max_length=120)
    registration_no = models.CharField(max_length=80, unique=True)
    qualifications = models.TextField()
    experience_years = models.PositiveSmallIntegerField()
    location = models.ForeignKey(
        "locations.Location", on_delete=models.PROTECT, related_name="doctors"
    )
    chamber_address = models.CharField(max_length=300)
    requested_fee_poisha = models.PositiveIntegerField()
    consultation_fee_poisha = models.PositiveIntegerField(null=True, blank=True)
    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.PENDING_APPROVAL
    )
    rejection_reason = models.TextField(blank=True, default="")
    suspension_reason = models.TextField(blank=True, default="")
    phone_verified_at = models.DateTimeField(null=True, blank=True)
    submitted_at = models.DateTimeField(null=True, blank=True)
    approved_at = models.DateTimeField(null=True, blank=True)
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="approved_doctors",
    )
    rejected_at = models.DateTimeField(null=True, blank=True)
    rejected_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="rejected_doctors",
    )
    suspended_at = models.DateTimeField(null=True, blank=True)
    suspended_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="suspended_doctors",
    )
    preferred_language = models.CharField(
        max_length=2, choices=Language.choices, default=Language.ENGLISH
    )
    last_login_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    user_type = "doctor"
    is_authenticated = True
    is_anonymous = False

    class Meta:
        ordering = ["created_at"]
        indexes = [models.Index(fields=["status"], name="doctor_status")]

    def __str__(self) -> str:
        return f"{self.full_name} ({self.doctor_code or self.phone})"

    def set_password(self, raw: str) -> None:
        self.password = make_password(raw)

    def check_password(self, raw: str) -> bool:
        return check_password(raw, self.password)

    @property
    def is_phone_verified(self) -> bool:
        return self.phone_verified_at is not None

    @property
    def is_approved(self) -> bool:
        return self.status == self.Status.APPROVED


class DoctorCertificate(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    doctor = models.ForeignKey(Doctor, on_delete=models.CASCADE, related_name="certificates")
    file = models.CharField(max_length=300)
    original_name = models.CharField(max_length=255)
    content_type = models.CharField(max_length=100)
    size = models.PositiveIntegerField()
    uploaded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["uploaded_at"]

    def __str__(self) -> str:
        return f"{self.original_name} ({self.doctor_id})"
