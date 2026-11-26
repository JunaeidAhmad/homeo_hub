"""Every /api/v1/ route. Breaking changes go in a new version (ADR-14)."""

from django.urls import include, path

from common.private_files import PrivateFileView

urlpatterns = [
    path("files/<str:token>/", PrivateFileView.as_view(), name="private-file"),
    path("health/", include("apps.health.urls")),
    path("locations/", include("apps.locations.urls")),
    path("auth/", include("apps.accounts.urls")),
    path("", include("apps.patients.urls")),
    path("", include("apps.staff.urls")),
    path("", include("apps.remedies.urls")),
    path("", include("apps.illnesses.urls")),
    path("", include("apps.orders.urls")),
    path("", include("apps.shops.urls")),
    path("", include("apps.payments.urls")),
    path("", include("apps.doctors.urls")),
    path("", include("apps.consultations.urls")),
]
