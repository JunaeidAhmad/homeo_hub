from django.db.models import Q, QuerySet
from django_filters import rest_framework as filters

from common.search import normalize_text

from .models import Location


class LocationFilter(filters.FilterSet):
    """``?division=`` and ``?district=``: an English (any case) or Bangla name."""

    division = filters.CharFilter(method="filter_division")
    district = filters.CharFilter(method="filter_district")

    class Meta:
        model = Location
        fields: list[str] = []

    @staticmethod
    def _by_name(queryset: QuerySet, level: str, value: str) -> QuerySet:
        return queryset.filter(
            Q(**{f"{level}_en__iexact": value.strip()})
            | Q(**{f"{level}_bn": normalize_text(value)})
        )

    def filter_division(self, queryset: QuerySet, name: str, value: str) -> QuerySet:
        return self._by_name(queryset, "division", value)

    def filter_district(self, queryset: QuerySet, name: str, value: str) -> QuerySet:
        return self._by_name(queryset, "district", value)
