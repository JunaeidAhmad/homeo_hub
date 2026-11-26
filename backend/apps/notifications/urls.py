from django.urls import path

from . import views

urlpatterns = [
    path("push/public-key/", views.PushPublicKeyView.as_view(), name="push-public-key"),
    # Patient notifications
    path("notifications/", views.PatientNotificationListView.as_view(), name="notifications-list"),
    path(
        "notifications/unread-count/",
        views.PatientNotificationUnreadCountView.as_view(),
        name="notifications-unread-count",
    ),
    path(
        "notifications/<uuid:pk>/read/",
        views.PatientNotificationMarkReadView.as_view(),
        name="notifications-mark-read",
    ),
    path(
        "notifications/read-all/",
        views.PatientNotificationMarkAllReadView.as_view(),
        name="notifications-read-all",
    ),
    path(
        "notifications/push-subscriptions/",
        views.PatientPushSubscriptionView.as_view(),
        name="notifications-push-subscriptions",
    ),
    # Doctor notifications
    path(
        "doctor/notifications/",
        views.DoctorNotificationListView.as_view(),
        name="doctor-notifications-list",
    ),
    path(
        "doctor/notifications/unread-count/",
        views.DoctorNotificationUnreadCountView.as_view(),
        name="doctor-notifications-unread-count",
    ),
    path(
        "doctor/notifications/<uuid:pk>/read/",
        views.DoctorNotificationMarkReadView.as_view(),
        name="doctor-notifications-mark-read",
    ),
    path(
        "doctor/notifications/read-all/",
        views.DoctorNotificationMarkAllReadView.as_view(),
        name="doctor-notifications-read-all",
    ),
    path(
        "doctor/notifications/push-subscriptions/",
        views.DoctorPushSubscriptionView.as_view(),
        name="doctor-notifications-push-subscriptions",
    ),
    # Admin / staff notifications
    path(
        "admin/notifications/",
        views.AdminNotificationListView.as_view(),
        name="admin-notifications-list",
    ),
    path(
        "admin/notifications/unread-count/",
        views.AdminNotificationUnreadCountView.as_view(),
        name="admin-notifications-unread-count",
    ),
    path(
        "admin/notifications/<uuid:pk>/read/",
        views.AdminNotificationMarkReadView.as_view(),
        name="admin-notifications-mark-read",
    ),
    path(
        "admin/notifications/read-all/",
        views.AdminNotificationMarkAllReadView.as_view(),
        name="admin-notifications-read-all",
    ),
    path(
        "admin/notifications/push-subscriptions/",
        views.AdminPushSubscriptionView.as_view(),
        name="admin-notifications-push-subscriptions",
    ),
]
