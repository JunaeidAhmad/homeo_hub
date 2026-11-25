from django.urls import path

from .views import LogoutView, RefreshView, ResendCodeView, StaffLogoutView, StaffRefreshView

urlpatterns = [
    path("otp/resend/", ResendCodeView.as_view(), name="auth-otp-resend"),
    path("refresh/", RefreshView.as_view(), name="auth-refresh"),
    path("logout/", LogoutView.as_view(), name="auth-logout"),
    path("staff/refresh/", StaffRefreshView.as_view(), name="auth-staff-refresh"),
    path("staff/logout/", StaffLogoutView.as_view(), name="auth-staff-logout"),
]
