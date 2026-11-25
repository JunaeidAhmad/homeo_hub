from typing import Any

from django.core.files.uploadedfile import UploadedFile
from django.db import IntegrityError, transaction
from django.utils.text import slugify

from common.errors import ApiError
from common.images import process_picture
from common.search import normalize_text

from .models import Remedy


class RemedyNameTaken(ApiError):
    status_code = 409
    error_code = "REMEDY_NAME_TAKEN"
    default_detail = "There is already a remedy with that name."


class RemedySlugTaken(ApiError):
    status_code = 409
    error_code = "REMEDY_SLUG_TAKEN"
    default_detail = "That web address is already used by another remedy."


def _free_slug(name: str) -> str:
    base = slugify(name)[:150] or "remedy"
    slug, number = base, 2
    while Remedy.objects.filter(slug=slug).exists():
        slug, number = f"{base}-{number}", number + 1
    return slug


def _clean(fields: dict[str, Any]) -> dict[str, Any]:
    """Text in one Unicode form, so Bangla is found however its letters were typed."""
    return {
        name: normalize_text(value) if isinstance(value, str) else value
        for name, value in fields.items()
    }


def _save(remedy: Remedy) -> Remedy:
    others = Remedy.objects.exclude(pk=remedy.pk)
    if others.filter(name__iexact=remedy.name).exists():
        raise RemedyNameTaken()
    if others.filter(slug=remedy.slug).exists():
        raise RemedySlugTaken()
    try:
        with transaction.atomic():
            remedy.save()
    except IntegrityError as error:  # someone else saved the same name a moment ago
        raise RemedyNameTaken() from error
    return remedy


def create_remedy(**fields: Any) -> Remedy:
    """``slug`` is optional: it is made from the name when left out."""
    fields = _clean(fields)
    fields["slug"] = fields.get("slug") or _free_slug(fields["name"])
    return _save(Remedy(**fields))


def update_remedy(remedy: Remedy, **fields: Any) -> Remedy:
    """The web address stays the same unless a new ``slug`` is given, even if renamed."""
    fields = _clean(fields)
    if not fields.get("slug"):
        fields.pop("slug", None)
    for name, value in fields.items():
        setattr(remedy, name, value)
    return _save(remedy)


def _delete_after_commit(storage: Any, name: str) -> None:
    if name:
        transaction.on_commit(lambda: storage.delete(name))


@transaction.atomic
def set_picture(remedy: Remedy, upload: UploadedFile) -> Remedy:
    picture = process_picture(upload)
    old = remedy.picture.name or ""
    remedy.picture.save(str(picture.name), picture, save=False)
    remedy.save(update_fields=["picture", "updated_at"])
    _delete_after_commit(remedy.picture.storage, old)
    return remedy


@transaction.atomic
def remove_picture(remedy: Remedy) -> Remedy:
    old, storage = remedy.picture.name or "", remedy.picture.storage
    remedy.picture = ""  # type: ignore[assignment]
    remedy.save(update_fields=["picture", "updated_at"])
    _delete_after_commit(storage, old)
    return remedy
