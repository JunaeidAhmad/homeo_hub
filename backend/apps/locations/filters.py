from django.db.models import Q, QuerySet
from django_filters import rest_framework as filters

from common.search import normalize_text

from .models import Location
from .spellings import current_spelling


class LocationFilter(filters.FilterSet):
    """``?division=`` and ``?district=``: a Bangla name, or an English one in any case.

    Older English spellings (Comilla, Barisal...) are accepted too.
    """

    division = filters.CharFilter(method="filter_by_name")
    district = filters.CharFilter(method="filter_by_name")

    class Meta:
        model = Location
        fields: list[str] = []

    def filter_by_name(self, queryset: QuerySet, level: str, value: str) -> QuerySet:
        name = normalize_text(value)
        return queryset.filter(
            Q(**{f"{level}_en__iexact": current_spelling(name)}) | Q(**{f"{level}_bn": name})
        )
