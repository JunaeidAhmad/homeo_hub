from django.urls import path

from . import views

urlpatterns = [
    path(
        "doctor/consultations/<uuid:pk>/prescription/",
        views.DoctorPrescriptionView.as_view(),
        name="doctor-consultation-prescription",
    ),
    path(
        "doctor-consultations/<uuid:pk>/prescription/",
        views.PatientPrescriptionView.as_view(),
        name="patient-consultation-prescription",
    ),
]
