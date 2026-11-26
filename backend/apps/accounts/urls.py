from django.urls import path

from .views import (
    DoctorLogoutView,
    DoctorRefreshView,
    LogoutView,
    RefreshView,
    ResendCodeView,
    StaffLogoutView,
    StaffRefreshView,
)

urlpatterns = [
    path("otp/resend/", ResendCodeView.as_view(), name="auth-otp-resend"),
    path("refresh/", RefreshView.as_view(), name="auth-refresh"),
    path("logout/", LogoutView.as_view(), name="auth-logout"),
    path("staff/refresh/", StaffRefreshView.as_view(), name="auth-staff-refresh"),
    path("staff/logout/", StaffLogoutView.as_view(), name="auth-staff-logout"),
    path("doctor/refresh/", DoctorRefreshView.as_view(), name="auth-doctor-refresh"),
    path("doctor/logout/", DoctorLogoutView.as_view(), name="auth-doctor-logout"),
]
