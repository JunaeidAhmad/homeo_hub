from django.urls import path

from . import views

urlpatterns = [
    path(
        "illness-categories/",
        views.IllnessCategoryListView.as_view(),
        name="illness-category-list",
    ),
    path(
        "illnesses/<slug:slug>/",
        views.IllnessDetailView.as_view(),
        name="illness-detail",
    ),
    path(
        "admin/illness-categories/",
        views.AdminIllnessCategoryListView.as_view(),
        name="admin-illness-categories",
    ),
    path(
        "admin/illness-categories/<uuid:pk>/",
        views.AdminIllnessCategoryDetailView.as_view(),
        name="admin-illness-category-detail",
    ),
    path(
        "admin/illnesses/",
        views.AdminIllnessListView.as_view(),
        name="admin-illnesses",
    ),
    path(
        "admin/illnesses/<uuid:pk>/",
        views.AdminIllnessDetailView.as_view(),
        name="admin-illness-detail",
    ),
    path(
        "admin/illnesses/<uuid:pk>/remedies/",
        views.AdminIllnessRemediesView.as_view(),
        name="admin-illness-remedies",
    ),
]
