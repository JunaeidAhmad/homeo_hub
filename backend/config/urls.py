from django.conf import settings
from django.contrib import admin
from django.urls import include, path, re_path
from django.views.static import serve
from drf_spectacular.views import SpectacularAPIView

urlpatterns = [
    path("api/v1/", include("config.api_v1")),
    path("api/v1/schema/", SpectacularAPIView.as_view(), name="schema"),
]

# Developer-only Django admin; the product admin lives at /admin on the web app. It is never
# mounted outside local development.
if settings.DEBUG:
    urlpatterns.append(path("django-admin/", admin.site.urls))

# Public uploads (remedy and profile pictures) kept on this server's disk are served from
# here; with a bucket they are served by the bucket instead. Private files never are: they
# go through signed links (common.private_files).
if settings.SERVE_MEDIA:
    urlpatterns.append(
        re_path(
            rf"^{settings.MEDIA_URL.strip('/')}/(?P<path>.*)$",
            serve,
            {"document_root": settings.MEDIA_ROOT},
        )
    )

handler404 = "common.errors.not_found"
handler500 = "common.errors.server_error"
