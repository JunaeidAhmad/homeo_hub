from django.urls import path

from . import views

urlpatterns = [
    path("admin/audit/", views.AdminAuditListView.as_view(), name="admin-audit-list"),
]
