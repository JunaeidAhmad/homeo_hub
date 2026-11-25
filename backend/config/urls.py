from django.contrib import admin
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView

urlpatterns = [
    path("api/v1/", include("config.api_v1")),
    path("api/v1/schema/", SpectacularAPIView.as_view(), name="schema"),
    # Developer-only Django admin; the product admin lives at /admin on the web app.
    path("django-admin/", admin.site.urls),
]

handler404 = "common.errors.not_found"
handler500 = "common.errors.server_error"
