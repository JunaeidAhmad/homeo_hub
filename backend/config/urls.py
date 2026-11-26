from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView

urlpatterns = [
    path("api/v1/", include("config.api_v1")),
    path("api/v1/schema/", SpectacularAPIView.as_view(), name="schema"),
]

# Developer-only Django admin; the product admin lives at /admin on the web app. Its sign-in
# is password-only (no TOTP), so it is never mounted outside local development.
if settings.DEBUG:
    urlpatterns.append(path("django-admin/", admin.site.urls))

# Development only (does nothing unless DEBUG): serve uploaded files.
urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)

handler404 = "common.errors.not_found"
handler500 = "common.errors.server_error"
