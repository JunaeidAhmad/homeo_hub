from django.urls import path

from .views import LogoutView, RefreshView, ResendCodeView

urlpatterns = [
    path("otp/resend/", ResendCodeView.as_view(), name="auth-otp-resend"),
    path("refresh/", RefreshView.as_view(), name="auth-refresh"),
    path("logout/", LogoutView.as_view(), name="auth-logout"),
]
