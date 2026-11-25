from drf_spectacular.utils import extend_schema
from rest_framework.generics import ListAPIView
from rest_framework.permissions import AllowAny

from .filters import LocationFilter
from .models import Location
from .serializers import LocationSerializer


@extend_schema(tags=["locations"])
class LocationListView(ListAPIView):
    """Bangladesh areas (division, district, upazila). Public: needed before sign-up."""

    queryset = Location.objects.all()
    serializer_class = LocationSerializer
    authentication_classes: list = []
    permission_classes = [AllowAny]

    filterset_class = LocationFilter
    ordering_fields = [
        "division_en",
        "division_bn",
        "district_en",
        "district_bn",
        "upazila_en",
        "upazila_bn",
    ]
    search_fields = [*ordering_fields, "old_spellings"]
    ordering = ["division_en", "district_en", "upazila_en"]
