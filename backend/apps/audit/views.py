from datetime import date

from django.db.models import QuerySet
from drf_spectacular.utils import OpenApiParameter, extend_schema, extend_schema_view
from rest_framework.generics import ListAPIView

from apps.staff.permissions import AdminView
from apps.staff.roles import Perm

from .models import AuditEntry
from .serializers import AuditEntrySerializer


def _parse_date(raw: str) -> date | None:
    try:
        return date.fromisoformat(raw.strip())
    except ValueError:
        return None


@extend_schema_view(
    get=extend_schema(
        operation_id="admin_audit_list",
        tags=["admin"],
        parameters=[
            OpenApiParameter("q", str),
            OpenApiParameter("actor_type", str, enum=list(AuditEntry.ActorType.values)),
            OpenApiParameter("action", str),
            OpenApiParameter("target_type", str),
            OpenApiParameter("from", str),
            OpenApiParameter("to", str),
        ],
    )
)
class AdminAuditListView(AdminView, ListAPIView):
    required_permissions = {"GET": Perm.VIEW_AUDIT_LOG}
    serializer_class = AuditEntrySerializer
    search_fields = ["actor_label", "action", "target_id"]
    filterset_fields = ["actor_type", "action", "target_type"]
    ordering_fields = ["created_at"]
    ordering = ["-created_at", "-id"]

    def get_queryset(self) -> QuerySet[AuditEntry]:
        qs = AuditEntry.objects.all()
        from_raw = self.request.query_params.get("from", "")
        to_raw = self.request.query_params.get("to", "")
        from_date = _parse_date(from_raw) if from_raw else None
        to_date = _parse_date(to_raw) if to_raw else None
        if from_date:
            qs = qs.filter(created_at__date__gte=from_date)
        if to_date:
            qs = qs.filter(created_at__date__lte=to_date)
        return qs
