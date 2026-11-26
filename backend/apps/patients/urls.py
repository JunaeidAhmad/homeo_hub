from django.urls import path

from . import views

urlpatterns = [
    path("auth/patient/signup/", views.SignUpView.as_view(), name="auth-patient-signup"),
    path("auth/patient/login/", views.LogInView.as_view(), name="auth-patient-login"),
    path("auth/otp/verify/", views.VerifyCodeView.as_view(), name="auth-otp-verify"),
    path("auth/password/forgot/", views.ForgotPasswordView.as_view(), name="auth-password-forgot"),
    path("auth/password/reset/", views.ResetPasswordView.as_view(), name="auth-password-reset"),
    path("me/", views.MeView.as_view(), name="me"),
    path("me/profile/", views.MeProfileView.as_view(), name="me-profile"),
    path("me/profile/basic/", views.MeProfileBasicView.as_view(), name="me-profile-basic"),
    path(
        "me/profile/sections/<str:key>/",
        views.MeProfileSectionView.as_view(),
        name="me-profile-section",
    ),
    path("me/profile/picture/", views.MeProfilePictureView.as_view(), name="me-profile-picture"),
]
