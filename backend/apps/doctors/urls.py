from django.urls import path

from . import views

urlpatterns = [
    path("auth/doctor/signup/", views.DoctorSignUpView.as_view(), name="auth-doctor-signup"),
    path("auth/doctor/verify/", views.DoctorVerifyView.as_view(), name="auth-doctor-verify"),
    path("auth/doctor/login/", views.DoctorLogInView.as_view(), name="auth-doctor-login"),
    path("doctor/me/", views.DoctorMeView.as_view(), name="doctor-me"),
    path(
        "doctor/application/",
        views.DoctorApplicationView.as_view(),
        name="doctor-application",
    ),
    path(
        "doctor/application/certificates/",
        views.DoctorCertificateUploadView.as_view(),
        name="doctor-certificate-upload",
    ),
    path(
        "doctor/application/certificates/<uuid:pk>/",
        views.DoctorCertificateDeleteView.as_view(),
        name="doctor-certificate-delete",
    ),
    path(
        "doctor/application/resubmit/",
        views.DoctorResubmitView.as_view(),
        name="doctor-application-resubmit",
    ),
    path("admin/doctors/", views.AdminDoctorListView.as_view(), name="admin-doctors"),
    path(
        "admin/doctors/<uuid:pk>/",
        views.AdminDoctorDetailView.as_view(),
        name="admin-doctor-detail",
    ),
    path(
        "admin/doctors/<uuid:pk>/approve/",
        views.AdminDoctorApproveView.as_view(),
        name="admin-doctor-approve",
    ),
    path(
        "admin/doctors/<uuid:pk>/reject/",
        views.AdminDoctorRejectView.as_view(),
        name="admin-doctor-reject",
    ),
    path(
        "admin/doctors/<uuid:pk>/suspend/",
        views.AdminDoctorSuspendView.as_view(),
        name="admin-doctor-suspend",
    ),
    path(
        "admin/doctors/<uuid:pk>/reactivate/",
        views.AdminDoctorReactivateView.as_view(),
        name="admin-doctor-reactivate",
    ),
]
