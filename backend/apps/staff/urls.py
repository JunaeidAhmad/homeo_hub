from django.urls import path

from . import views

urlpatterns = [
    path("auth/staff/login/", views.StaffLogInView.as_view(), name="auth-staff-login"),
    path("admin/me/", views.AdminMeView.as_view(), name="admin-me"),
    path("admin/roles/", views.RoleListView.as_view(), name="admin-roles"),
    path("admin/staff/", views.StaffListView.as_view(), name="admin-staff"),
    path("admin/staff/<int:pk>/", views.StaffDetailView.as_view(), name="admin-staff-detail"),
]
