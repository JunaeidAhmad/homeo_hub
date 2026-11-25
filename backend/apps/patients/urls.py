from django.urls import path

from . import views

urlpatterns = [
    path("auth/patient/signup/", views.SignUpView.as_view(), name="auth-patient-signup"),
    path("auth/patient/login/", views.LogInView.as_view(), name="auth-patient-login"),
    path("auth/otp/verify/", views.VerifyCodeView.as_view(), name="auth-otp-verify"),
    path("auth/password/forgot/", views.ForgotPasswordView.as_view(), name="auth-password-forgot"),
    path("auth/password/reset/", views.ResetPasswordView.as_view(), name="auth-password-reset"),
    path("me/", views.MeView.as_view(), name="me"),
]
