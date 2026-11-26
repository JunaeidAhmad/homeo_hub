from django.urls import path

from . import views

urlpatterns = [
    path("remedies/", views.RemedyListView.as_view(), name="remedy-list"),
    path("remedies/<slug:slug>/", views.RemedyDetailView.as_view(), name="remedy-detail"),
    path("admin/remedies/", views.AdminRemedyListView.as_view(), name="admin-remedies"),
    path(
        "admin/remedies/<uuid:pk>/",
        views.AdminRemedyDetailView.as_view(),
        name="admin-remedy-detail",
    ),
    path(
        "admin/remedies/<uuid:pk>/picture/",
        views.AdminRemedyPictureView.as_view(),
        name="admin-remedy-picture",
    ),
    path(
        "admin/remedies/<uuid:pk>/prices/",
        views.AdminRemedyPricesView.as_view(),
        name="admin-remedy-prices",
    ),
]
