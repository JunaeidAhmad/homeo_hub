from django.db.models import QuerySet
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework.generics import ListAPIView
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from common.i18n import current_language

from .filters import LocationFilter
from .models import Location
from .serializers import AreaNameSerializer, LocationSerializer


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


class _AreaNamesView(APIView):
    """The distinct names at one level, in the request's language, sorted by English name."""

    authentication_classes: list = []
    permission_classes = [AllowAny]
    level: str

    def areas(self, request: Request) -> QuerySet[Location]:
        return Location.objects.all()

    def get(self, request: Request) -> Response:
        rows = (
            self.areas(request)
            .order_by(f"{self.level}_en")
            .values_list(f"{self.level}_en", f"{self.level}_bn")
            .distinct()
        )
        bangla = current_language() == "bn"
        names = [{"name": (bn if bangla and bn.strip() else en)} for en, bn in rows]
        return Response(AreaNameSerializer(names, many=True).data)


@extend_schema(tags=["locations"], responses=AreaNameSerializer(many=True))
class DivisionListView(_AreaNamesView):
    """Every division, for the first step of choosing an area."""

    level = "division"


@extend_schema(
    tags=["locations"],
    responses=AreaNameSerializer(many=True),
    parameters=[
        OpenApiParameter(
            "division",
            str,
            required=True,
            description="A division name, in Bangla or English.",
        )
    ],
)
class DistrictListView(_AreaNamesView):
    """The districts of one division. Their upazilas / thanas: ``/locations/?district=``."""

    level = "district"

    def areas(self, request: Request) -> QuerySet[Location]:
        division = request.query_params.get("division", "")
        return LocationFilter().filter_by_name(Location.objects.all(), "division", division)
