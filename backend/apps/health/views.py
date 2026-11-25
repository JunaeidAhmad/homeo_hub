from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from .checks import run_checks
from .serializers import LiveSerializer, ReadySerializer


class LiveView(APIView):
    """The process is up. Never touches the database or Redis."""

    authentication_classes = []
    permission_classes = []
    throttle_classes = []  # monitors poll this often

    @extend_schema(operation_id="health_live", responses=LiveSerializer, tags=["health"])
    def get(self, request: Request) -> Response:
        return Response({"status": "ok"})


class ReadyView(APIView):
    """The process can serve traffic: Postgres and Redis both answer."""

    authentication_classes = []
    permission_classes = []
    throttle_classes = []  # monitors poll this often

    @extend_schema(
        operation_id="health_ready",
        responses={200: ReadySerializer, 503: ReadySerializer},
        tags=["health"],
    )
    def get(self, request: Request) -> Response:
        checks = run_checks()
        healthy = all(result == "ok" for result in checks.values())
        return Response(
            {"status": "ok" if healthy else "degraded", "checks": checks},
            status=status.HTTP_200_OK if healthy else status.HTTP_503_SERVICE_UNAVAILABLE,
        )
