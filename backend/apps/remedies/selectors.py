"""Reading remedies. Other apps use these rather than querying ``Remedy`` themselves."""

from django.db.models import Prefetch, QuerySet

from .models import Remedy, RemedyPrice


def active_prices_prefetch(relation: str = "prices") -> Prefetch:
    return Prefetch(
        relation,
        queryset=RemedyPrice.objects.filter(is_active=True),
        to_attr="active_prices",
    )


def all_remedies() -> QuerySet[Remedy]:
    return Remedy.objects.prefetch_related("prices")


def public_remedies() -> QuerySet[Remedy]:
    """What patients and guests may see: active remedies only, with active prices."""
    return Remedy.objects.filter(status=Remedy.Status.ACTIVE).prefetch_related(
        active_prices_prefetch()
    )


def patient_price(remedy: Remedy, form: str) -> int | None:
    """Active patient price in poisha for an active remedy and form, or None."""
    if remedy.status != Remedy.Status.ACTIVE:
        return None
    price = RemedyPrice.objects.filter(remedy=remedy, form=form, is_active=True).first()
    return price.price_poisha if price else None
