"""Reading remedies. Other apps use these rather than querying ``Remedy`` themselves."""

from django.db.models import QuerySet

from .models import Remedy


def all_remedies() -> QuerySet[Remedy]:
    return Remedy.objects.all()


def public_remedies() -> QuerySet[Remedy]:
    """What patients and guests may see: active remedies only."""
    return Remedy.objects.filter(status=Remedy.Status.ACTIVE)
