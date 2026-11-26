"""Registered partner shops, their staff links, and their own remedy price lists."""

import uuid

from django.conf import settings
from django.db import models
from django.db.models import F, Q


class Shop(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=150)
    slug = models.SlugField(max_length=160, unique=True)
    location = models.ForeignKey(
        "locations.Location", on_delete=models.PROTECT, related_name="shops"
    )
    address_line = models.CharField(max_length=300)
    phone = models.CharField(max_length=14)
    latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    is_verified = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name"]

    def __str__(self) -> str:
        return self.name


class ShopStaff(models.Model):
    class Role(models.TextChoices):
        OWNER = "OWNER"
        STAFF = "STAFF"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    shop = models.ForeignKey(Shop, on_delete=models.CASCADE, related_name="staff_links")
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="shop_links"
    )
    role = models.CharField(max_length=10, choices=Role.choices, default=Role.OWNER)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]
        constraints = [
            models.UniqueConstraint(fields=["shop", "user"], name="shop_staff_unique"),
        ]

    def __str__(self) -> str:
        return f"{self.shop.name}: {self.user_id} ({self.role})"


class ShopRemedy(models.Model):
    class Unit(models.TextChoices):
        ML = "ML"
        GRAM = "GRAM"
        DRAM = "DRAM"
        PIECE = "PIECE"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    shop = models.ForeignKey(Shop, on_delete=models.CASCADE, related_name="listings")
    remedy = models.ForeignKey(
        "remedies.Remedy", on_delete=models.PROTECT, related_name="shop_listings"
    )
    pack_size = models.PositiveIntegerField()
    unit = models.CharField(max_length=10, choices=Unit.choices)
    price_poisha = models.PositiveIntegerField()
    stock_qty = models.PositiveIntegerField(default=0)
    reserved_qty = models.PositiveIntegerField(default=0)
    is_available = models.BooleanField(default=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["remedy__name", "pack_size", "unit"]
        constraints = [
            models.UniqueConstraint(
                fields=["shop", "remedy", "pack_size", "unit"],
                name="shop_remedy_unique_pack",
            ),
            models.CheckConstraint(
                condition=Q(price_poisha__gt=0),
                name="shop_remedy_price_positive",
            ),
            models.CheckConstraint(
                condition=Q(pack_size__gt=0),
                name="shop_remedy_pack_positive",
            ),
            models.CheckConstraint(
                condition=Q(reserved_qty__lte=F("stock_qty")),
                name="shop_remedy_reserved_lte_stock",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.shop.name} — {self.remedy.name} ({self.pack_size} {self.unit})"

    @property
    def free_qty(self) -> int:
        return max(0, self.stock_qty - self.reserved_qty)
