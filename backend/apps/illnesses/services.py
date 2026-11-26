from typing import Any
from uuid import UUID

from django.db import IntegrityError, transaction
from django.utils.text import slugify

from apps.remedies.models import Remedy
from common.errors import ApiError
from common.search import normalize_text

from .models import Illness, IllnessCategory, IllnessRemedy


class IllnessSlugTaken(ApiError):
    status_code = 409
    error_code = "ILLNESS_SLUG_TAKEN"
    default_detail = "That web address is already in use."


class DuplicateRemedy(ApiError):
    status_code = 400
    error_code = "DUPLICATE_REMEDY"
    default_detail = "Each remedy may appear only once in the ranked list."


class UnknownRemedy(ApiError):
    status_code = 400
    error_code = "UNKNOWN_REMEDY"
    default_detail = "One or more chosen remedies do not exist."


def _clean(fields: dict[str, Any]) -> dict[str, Any]:
    return {
        name: normalize_text(value) if isinstance(value, str) else value
        for name, value in fields.items()
    }


def _free_slug(model: type[IllnessCategory] | type[Illness], name: str, fallback: str) -> str:
    base = slugify(name)[:150] or fallback
    slug, number = base, 2
    while model.objects.filter(slug=slug).exists():
        slug, number = f"{base}-{number}", number + 1
    return slug


def _save_category(category: IllnessCategory) -> IllnessCategory:
    if IllnessCategory.objects.exclude(pk=category.pk).filter(slug=category.slug).exists():
        raise IllnessSlugTaken()
    try:
        with transaction.atomic():
            category.save()
    except IntegrityError as error:
        raise IllnessSlugTaken() from error
    return category


def create_category(**fields: Any) -> IllnessCategory:
    fields = _clean(fields)
    fields["slug"] = fields.get("slug") or _free_slug(
        IllnessCategory, fields["name_en"], "category"
    )
    return _save_category(IllnessCategory(**fields))


def update_category(category: IllnessCategory, **fields: Any) -> IllnessCategory:
    fields = _clean(fields)
    if not fields.get("slug"):
        fields.pop("slug", None)
    for name, value in fields.items():
        setattr(category, name, value)
    return _save_category(category)


def _save_illness(illness: Illness) -> Illness:
    if Illness.objects.exclude(pk=illness.pk).filter(slug=illness.slug).exists():
        raise IllnessSlugTaken()
    try:
        with transaction.atomic():
            illness.save()
    except IntegrityError as error:
        raise IllnessSlugTaken() from error
    return illness


def create_illness(**fields: Any) -> Illness:
    fields = _clean(fields)
    fields["slug"] = fields.get("slug") or _free_slug(Illness, fields["name_en"], "illness")
    return _save_illness(Illness(**fields))


def update_illness(illness: Illness, **fields: Any) -> Illness:
    fields = _clean(fields)
    if not fields.get("slug"):
        fields.pop("slug", None)
    for name, value in fields.items():
        setattr(illness, name, value)
    return _save_illness(illness)


@transaction.atomic
def set_ranked_remedies(illness: Illness, remedy_ids: list[UUID]) -> list[IllnessRemedy]:
    if len(remedy_ids) != len(set(remedy_ids)):
        raise DuplicateRemedy()
    found = Remedy.objects.filter(id__in=remedy_ids).values_list("id", flat=True)
    if len(set(found)) != len(remedy_ids):
        raise UnknownRemedy()

    Illness.objects.select_for_update().get(pk=illness.pk)
    IllnessRemedy.objects.filter(illness=illness).delete()
    items = [
        IllnessRemedy(illness=illness, remedy_id=remedy_id, rank=index + 1)
        for index, remedy_id in enumerate(remedy_ids)
    ]
    if items:
        IllnessRemedy.objects.bulk_create(items)
    return list(
        IllnessRemedy.objects.filter(illness=illness).select_related("remedy").order_by("rank")
    )
