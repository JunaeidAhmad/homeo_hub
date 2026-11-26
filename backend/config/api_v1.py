"""Every /api/v1/ route. Breaking changes go in a new version (ADR-14)."""

from django.urls import include, path

urlpatterns = [
    path("health/", include("apps.health.urls")),
    path("locations/", include("apps.locations.urls")),
    path("auth/", include("apps.accounts.urls")),
    path("", include("apps.patients.urls")),
    path("", include("apps.staff.urls")),
    path("", include("apps.remedies.urls")),
    path("", include("apps.illnesses.urls")),
]
