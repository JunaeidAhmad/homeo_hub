"""Reading illnesses and ranked remedies."""

from django.db.models import Count, Prefetch, Q, QuerySet

from apps.remedies.models import Remedy
from apps.remedies.selectors import active_prices_prefetch

from .models import Illness, IllnessCategory, IllnessRemedy


def all_categories() -> QuerySet[IllnessCategory]:
    return IllnessCategory.objects.all()


def all_illnesses() -> QuerySet[Illness]:
    return Illness.objects.select_related("category")


def public_categories() -> QuerySet[IllnessCategory]:
    """Active categories that have at least one active illness, with active illnesses prefetched.

    Each prefetched illness carries ``remedy_count``: how many active remedies it lists.
    """
    active_illnesses = (
        Illness.objects.filter(status=Illness.Status.ACTIVE)
        .annotate(
            remedy_count=Count(
                "ranked_remedies",
                filter=Q(ranked_remedies__remedy__status=Remedy.Status.ACTIVE),
            )
        )
        .order_by("name_en")
    )
    return (
        IllnessCategory.objects.filter(
            is_active=True,
            illnesses__status=Illness.Status.ACTIVE,
        )
        .distinct()
        .prefetch_related(
            Prefetch("illnesses", queryset=active_illnesses, to_attr="active_illnesses")
        )
    )


def public_illnesses() -> QuerySet[Illness]:
    """Active illnesses in active categories."""
    return Illness.objects.select_related("category").filter(
        status=Illness.Status.ACTIVE,
        category__is_active=True,
    )


def public_illness(slug: str) -> Illness:
    return public_illnesses().get(slug=slug)


def ranked_public_remedies(illness: Illness) -> list[Remedy]:
    """Active remedies for an illness in rank order, with active prices prefetched."""
    rows = (
        IllnessRemedy.objects.filter(
            illness=illness,
            remedy__status=Remedy.Status.ACTIVE,
        )
        .select_related("remedy")
        .prefetch_related(active_prices_prefetch("remedy__prices"))
        .order_by("rank")
    )
    remedies: list[Remedy] = []
    for row in rows:
        remedy = row.remedy
        remedy.rank = row.rank  # type: ignore[attr-defined]
        remedies.append(remedy)
    return remedies
