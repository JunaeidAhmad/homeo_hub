"""Every /api/v1/ route. Breaking changes go in a new version (ADR-14)."""

from django.urls import include, path

urlpatterns = [
    path("health/", include("apps.health.urls")),
]
