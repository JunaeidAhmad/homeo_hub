from typing import Any

from django.contrib.auth.models import User
from django.db import IntegrityError, transaction
from django.utils.text import slugify

from apps.locations.models import Location
from apps.remedies.models import Remedy
from apps.staff.roles import Role
from apps.staff.services import roles_of
from common.errors import ApiError
from common.phone import InvalidPhone, normalize_phone
from common.search import normalize_text

from .models import Shop, ShopRemedy, ShopStaff


class ShopSlugTaken(ApiError):
    status_code = 409
    error_code = "SHOP_SLUG_TAKEN"
    default_detail = "That web address is already used by another shop."


class NotShopStaff(ApiError):
    status_code = 400
    error_code = "NOT_SHOP_STAFF"
    default_detail = "Only active staff members with the shop owner role can be linked."


class StaffAlreadyLinked(ApiError):
    status_code = 409
    error_code = "STAFF_ALREADY_LINKED"
    default_detail = "That staff member is already linked to this shop."


class ListingExists(ApiError):
    status_code = 409
    error_code = "LISTING_EXISTS"
    default_detail = "This shop already has a listing for that remedy, pack size, and unit."


class ListingInUse(ApiError):
    status_code = 409
    error_code = "LISTING_IN_USE"
    default_detail = "This listing has reserved stock for active orders and cannot be removed."


class StockBelowReserved(ApiError):
    status_code = 409
    error_code = "STOCK_BELOW_RESERVED"
    default_detail = "Stock cannot be lower than the quantity already reserved."


class InvalidShopPhone(ApiError):
    status_code = 400
    error_code = "INVALID_PHONE"
    default_detail = "Enter a Bangladeshi mobile number."


def _free_slug(name: str) -> str:
    base = slugify(name)[:150] or "shop"
    slug, number = base, 2
    while Shop.objects.filter(slug=slug).exists():
        slug, number = f"{base}-{number}", number + 1
    return slug


def _clean_phone(raw: str) -> str:
    try:
        return normalize_phone(raw)
    except InvalidPhone as error:
        raise InvalidShopPhone() from error


def _save_shop(shop: Shop) -> Shop:
    if Shop.objects.exclude(pk=shop.pk).filter(slug=shop.slug).exists():
        raise ShopSlugTaken()
    try:
        with transaction.atomic():
            shop.save()
    except IntegrityError as error:
        raise ShopSlugTaken() from error
    return Shop.objects.select_related("location").get(pk=shop.pk)


def create_shop(
    *,
    name: str,
    location: Location,
    address_line: str,
    phone: str,
    slug: str = "",
    latitude: Any = None,
    longitude: Any = None,
    is_verified: bool = False,
    is_active: bool = True,
) -> Shop:
    clean_name = normalize_text(name).strip()
    clean_slug = slug.strip() or _free_slug(clean_name)
    shop = Shop(
        name=clean_name,
        slug=clean_slug,
        location=location,
        address_line=normalize_text(address_line).strip(),
        phone=_clean_phone(phone),
        latitude=latitude,
        longitude=longitude,
        is_verified=is_verified,
        is_active=is_active,
    )
    return _save_shop(shop)


def update_shop(shop: Shop, **fields: Any) -> Shop:
    if "name" in fields:
        fields["name"] = normalize_text(fields["name"]).strip()
    if "address_line" in fields:
        fields["address_line"] = normalize_text(fields["address_line"]).strip()
    if "phone" in fields:
        fields["phone"] = _clean_phone(fields["phone"])
    if not fields.get("slug"):
        fields.pop("slug", None)
    for key, value in fields.items():
        setattr(shop, key, value)
    return _save_shop(shop)


@transaction.atomic
def link_staff(shop: Shop, user: User, role: str = ShopStaff.Role.OWNER) -> ShopStaff:
    if not user.is_active or not user.is_staff or Role.SHOP_OWNER.value not in roles_of(user):
        raise NotShopStaff()
    try:
        with transaction.atomic():
            return ShopStaff.objects.create(shop=shop, user=user, role=role)
    except IntegrityError as error:
        raise StaffAlreadyLinked() from error


@transaction.atomic
def unlink_staff(link: ShopStaff) -> None:
    link.delete()


@transaction.atomic
def create_listing(
    *,
    shop: Shop,
    remedy: Remedy,
    pack_size: int,
    unit: str,
    price_poisha: int,
    stock_qty: int = 0,
    is_available: bool = True,
) -> ShopRemedy:
    try:
        with transaction.atomic():
            listing = ShopRemedy.objects.create(
                shop=shop,
                remedy=remedy,
                pack_size=pack_size,
                unit=unit,
                price_poisha=price_poisha,
                stock_qty=stock_qty,
                is_available=is_available,
            )
    except IntegrityError as error:
        raise ListingExists() from error
    return ShopRemedy.objects.select_related("remedy", "shop").get(pk=listing.pk)


@transaction.atomic
def update_listing(listing: ShopRemedy, **fields: Any) -> ShopRemedy:
    locked = ShopRemedy.objects.select_for_update().get(pk=listing.pk)
    if "stock_qty" in fields and fields["stock_qty"] < locked.reserved_qty:
        raise StockBelowReserved()
    for key, value in fields.items():
        setattr(locked, key, value)
    try:
        with transaction.atomic():
            locked.save()
    except IntegrityError as error:
        raise ListingExists() from error
    return ShopRemedy.objects.select_related("remedy", "shop").get(pk=locked.pk)


@transaction.atomic
def delete_listing(listing: ShopRemedy) -> None:
    locked = ShopRemedy.objects.select_for_update().get(pk=listing.pk)
    if locked.reserved_qty > 0:
        raise ListingInUse()
    locked.delete()
