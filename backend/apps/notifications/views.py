from django.conf import settings
from django.db.models import QuerySet
from django.http import Http404
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework.generics import ListAPIView
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.doctors.permissions import IsDoctor
from apps.patients.permissions import IsPatient
from apps.staff.permissions import ANY_STAFF, AdminView
from common.serializers import ErrorSerializer

from . import due, services
from .models import Notification, RecipientType
from .serializers import (
    NotificationSerializer,
    PushPublicKeySerializer,
    PushSubscriptionInputSerializer,
    PushSubscriptionStatusSerializer,
    UnreadCountSerializer,
)

ADMIN_REFUSED = {401: ErrorSerializer, 403: ErrorSerializer}


class NotificationAudienceMixin:
    recipient_type: str = RecipientType.PATIENT

    def _recipient_id(self, request: Request) -> str:
        return str(request.user.pk)

    def _notifications_queryset(self, request: Request) -> QuerySet[Notification]:
        qs = Notification.objects.filter(
            recipient_type=self.recipient_type,
            recipient_id=self._recipient_id(request),
        )
        unread = (request.query_params.get("unread") or "").strip().lower()
        if unread in ("1", "true", "yes"):
            qs = qs.filter(read_at__isnull=True)
        return qs


class NotificationListBase(NotificationAudienceMixin, ListAPIView):
    serializer_class = NotificationSerializer
    filter_backends: list = []

    def get_queryset(self) -> QuerySet[Notification]:
        if getattr(self, "swagger_fake_view", False):
            return Notification.objects.none()
        return self._notifications_queryset(self.request)


class NotificationUnreadCountBase(NotificationAudienceMixin, APIView):
    def _get_unread_count(self, request: Request) -> Response:
        rid = self._recipient_id(request)
        due.run_due_checks(self.recipient_type, rid)
        count = Notification.objects.filter(
            recipient_type=self.recipient_type,
            recipient_id=rid,
            read_at__isnull=True,
        ).count()
        return Response(UnreadCountSerializer({"unread_count": count}).data)


class NotificationMarkReadBase(NotificationAudienceMixin, APIView):
    def _post_mark_read(self, request: Request, pk: str) -> Response:
        notif = services.mark_read(self.recipient_type, self._recipient_id(request), pk)
        if notif is None:
            raise Http404("Notification not found.")
        return Response(NotificationSerializer(notif, context={"request": request}).data)


class NotificationMarkAllReadBase(NotificationAudienceMixin, APIView):
    def _post_mark_all(self, request: Request) -> Response:
        services.mark_all_read(self.recipient_type, self._recipient_id(request))
        return Response(UnreadCountSerializer({"unread_count": 0}).data)


class PushSubscriptionBase(NotificationAudienceMixin, APIView):
    def _post_subscribe(self, request: Request) -> Response:
        body = PushSubscriptionInputSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        keys = body.validated_data["keys"]
        services.register_push_subscription(
            self.recipient_type,
            self._recipient_id(request),
            endpoint=body.validated_data["endpoint"],
            p256dh=keys["p256dh"],
            auth=keys["auth"],
            user_agent=str(request.headers.get("User-Agent", "")),
        )
        return Response(PushSubscriptionStatusSerializer({"subscribed": True}).data)

    def _delete_subscribe(self, request: Request) -> Response:
        endpoint = (request.query_params.get("endpoint") or "").strip()
        if not endpoint and isinstance(request.data, dict):
            endpoint = str(request.data.get("endpoint", "")).strip()
        services.remove_push_subscription(
            self.recipient_type,
            self._recipient_id(request),
            endpoint=endpoint,
        )
        return Response(PushSubscriptionStatusSerializer({"subscribed": False}).data)


# --- Patient -----------------------------------------------------------------


class PatientNotificationListView(NotificationListBase):
    permission_classes = [IsPatient]
    recipient_type = RecipientType.PATIENT

    @extend_schema(
        operation_id="notifications_list",
        tags=["notifications"],
        parameters=[OpenApiParameter("unread", bool, required=False)],
        responses={200: NotificationSerializer(many=True), 401: ErrorSerializer},
    )
    def get(self, request: Request, *args, **kwargs) -> Response:
        return super().get(request, *args, **kwargs)


class PatientNotificationUnreadCountView(NotificationUnreadCountBase):
    permission_classes = [IsPatient]
    recipient_type = RecipientType.PATIENT

    @extend_schema(
        operation_id="notifications_unread_count",
        tags=["notifications"],
        responses={200: UnreadCountSerializer, 401: ErrorSerializer},
    )
    def get(self, request: Request) -> Response:
        return self._get_unread_count(request)


class PatientNotificationMarkReadView(NotificationMarkReadBase):
    permission_classes = [IsPatient]
    recipient_type = RecipientType.PATIENT

    @extend_schema(
        operation_id="notifications_read",
        tags=["notifications"],
        request=None,
        responses={200: NotificationSerializer, 401: ErrorSerializer, 404: ErrorSerializer},
    )
    def post(self, request: Request, pk: str) -> Response:
        return self._post_mark_read(request, pk)


class PatientNotificationMarkAllReadView(NotificationMarkAllReadBase):
    permission_classes = [IsPatient]
    recipient_type = RecipientType.PATIENT

    @extend_schema(
        operation_id="notifications_read_all",
        tags=["notifications"],
        request=None,
        responses={200: UnreadCountSerializer, 401: ErrorSerializer},
    )
    def post(self, request: Request) -> Response:
        return self._post_mark_all(request)


class PatientPushSubscriptionView(PushSubscriptionBase):
    permission_classes = [IsPatient]
    recipient_type = RecipientType.PATIENT

    @extend_schema(
        operation_id="notifications_push_subscribe",
        tags=["notifications"],
        request=PushSubscriptionInputSerializer,
        responses={
            200: PushSubscriptionStatusSerializer,
            400: ErrorSerializer,
            401: ErrorSerializer,
        },
    )
    def post(self, request: Request) -> Response:
        return self._post_subscribe(request)

    @extend_schema(
        operation_id="notifications_push_unsubscribe",
        tags=["notifications"],
        parameters=[OpenApiParameter("endpoint", str, required=False)],
        request=None,
        responses={200: PushSubscriptionStatusSerializer, 401: ErrorSerializer},
    )
    def delete(self, request: Request) -> Response:
        return self._delete_subscribe(request)


# --- Doctor ------------------------------------------------------------------


class DoctorNotificationListView(NotificationListBase):
    permission_classes = [IsDoctor]
    recipient_type = RecipientType.DOCTOR

    @extend_schema(
        operation_id="doctor_notifications_list",
        tags=["doctor"],
        parameters=[OpenApiParameter("unread", bool, required=False)],
        responses={200: NotificationSerializer(many=True), 401: ErrorSerializer},
    )
    def get(self, request: Request, *args, **kwargs) -> Response:
        return super().get(request, *args, **kwargs)


class DoctorNotificationUnreadCountView(NotificationUnreadCountBase):
    permission_classes = [IsDoctor]
    recipient_type = RecipientType.DOCTOR

    @extend_schema(
        operation_id="doctor_notifications_unread_count",
        tags=["doctor"],
        responses={200: UnreadCountSerializer, 401: ErrorSerializer},
    )
    def get(self, request: Request) -> Response:
        return self._get_unread_count(request)


class DoctorNotificationMarkReadView(NotificationMarkReadBase):
    permission_classes = [IsDoctor]
    recipient_type = RecipientType.DOCTOR

    @extend_schema(
        operation_id="doctor_notifications_read",
        tags=["doctor"],
        request=None,
        responses={200: NotificationSerializer, 401: ErrorSerializer, 404: ErrorSerializer},
    )
    def post(self, request: Request, pk: str) -> Response:
        return self._post_mark_read(request, pk)


class DoctorNotificationMarkAllReadView(NotificationMarkAllReadBase):
    permission_classes = [IsDoctor]
    recipient_type = RecipientType.DOCTOR

    @extend_schema(
        operation_id="doctor_notifications_read_all",
        tags=["doctor"],
        request=None,
        responses={200: UnreadCountSerializer, 401: ErrorSerializer},
    )
    def post(self, request: Request) -> Response:
        return self._post_mark_all(request)


class DoctorPushSubscriptionView(PushSubscriptionBase):
    permission_classes = [IsDoctor]
    recipient_type = RecipientType.DOCTOR

    @extend_schema(
        operation_id="doctor_notifications_push_subscribe",
        tags=["doctor"],
        request=PushSubscriptionInputSerializer,
        responses={
            200: PushSubscriptionStatusSerializer,
            400: ErrorSerializer,
            401: ErrorSerializer,
        },
    )
    def post(self, request: Request) -> Response:
        return self._post_subscribe(request)

    @extend_schema(
        operation_id="doctor_notifications_push_unsubscribe",
        tags=["doctor"],
        parameters=[OpenApiParameter("endpoint", str, required=False)],
        request=None,
        responses={200: PushSubscriptionStatusSerializer, 401: ErrorSerializer},
    )
    def delete(self, request: Request) -> Response:
        return self._delete_subscribe(request)


# --- Staff / Admin -----------------------------------------------------------


class AdminNotificationListView(AdminView, NotificationListBase):
    required_permissions = {"GET": ANY_STAFF}
    recipient_type = RecipientType.STAFF

    @extend_schema(
        operation_id="admin_notifications_list",
        tags=["admin"],
        parameters=[OpenApiParameter("unread", bool, required=False)],
        responses={200: NotificationSerializer(many=True), **ADMIN_REFUSED},
    )
    def get(self, request: Request, *args, **kwargs) -> Response:
        return super().get(request, *args, **kwargs)


class AdminNotificationUnreadCountView(AdminView, NotificationUnreadCountBase):
    required_permissions = {"GET": ANY_STAFF}
    recipient_type = RecipientType.STAFF

    @extend_schema(
        operation_id="admin_notifications_unread_count",
        tags=["admin"],
        responses={200: UnreadCountSerializer, **ADMIN_REFUSED},
    )
    def get(self, request: Request) -> Response:
        return self._get_unread_count(request)


class AdminNotificationMarkReadView(AdminView, NotificationMarkReadBase):
    required_permissions = {"POST": ANY_STAFF}
    recipient_type = RecipientType.STAFF

    @extend_schema(
        operation_id="admin_notifications_read",
        tags=["admin"],
        request=None,
        responses={200: NotificationSerializer, **ADMIN_REFUSED, 404: ErrorSerializer},
    )
    def post(self, request: Request, pk: str) -> Response:
        return self._post_mark_read(request, pk)


class AdminNotificationMarkAllReadView(AdminView, NotificationMarkAllReadBase):
    required_permissions = {"POST": ANY_STAFF}
    recipient_type = RecipientType.STAFF

    @extend_schema(
        operation_id="admin_notifications_read_all",
        tags=["admin"],
        request=None,
        responses={200: UnreadCountSerializer, **ADMIN_REFUSED},
    )
    def post(self, request: Request) -> Response:
        return self._post_mark_all(request)


class AdminPushSubscriptionView(AdminView, PushSubscriptionBase):
    required_permissions = {"POST": ANY_STAFF, "DELETE": ANY_STAFF}
    recipient_type = RecipientType.STAFF

    @extend_schema(
        operation_id="admin_notifications_push_subscribe",
        tags=["admin"],
        request=PushSubscriptionInputSerializer,
        responses={200: PushSubscriptionStatusSerializer, 400: ErrorSerializer, **ADMIN_REFUSED},
    )
    def post(self, request: Request) -> Response:
        return self._post_subscribe(request)

    @extend_schema(
        operation_id="admin_notifications_push_unsubscribe",
        tags=["admin"],
        parameters=[OpenApiParameter("endpoint", str, required=False)],
        request=None,
        responses={200: PushSubscriptionStatusSerializer, **ADMIN_REFUSED},
    )
    def delete(self, request: Request) -> Response:
        return self._delete_subscribe(request)


# --- Public ------------------------------------------------------------------


class PushPublicKeyView(APIView):
    authentication_classes: list = []
    permission_classes = [AllowAny]

    @extend_schema(
        operation_id="push_public_key",
        tags=["notifications"],
        responses={200: PushPublicKeySerializer},
    )
    def get(self, request: Request) -> Response:
        return Response(
            PushPublicKeySerializer(
                {
                    "public_key": getattr(settings, "WEBPUSH_VAPID_PUBLIC_KEY", "") or "",
                    "enabled": services.webpush_configured(),
                }
            ).data
        )
