from django.urls import path

from . import views

urlpatterns = [
    path("admin/shops/", views.AdminShopListView.as_view(), name="admin-shops"),
    path("admin/shops/<uuid:pk>/", views.AdminShopDetailView.as_view(), name="admin-shop-detail"),
    path(
        "admin/shops/<uuid:pk>/staff/",
        views.AdminShopStaffListView.as_view(),
        name="admin-shop-staff",
    ),
    path(
        "admin/shops/<uuid:pk>/staff/<uuid:link_id>/",
        views.AdminShopStaffDetailView.as_view(),
        name="admin-shop-staff-detail",
    ),
    path(
        "admin/shop-staff-candidates/",
        views.AdminShopStaffCandidatesView.as_view(),
        name="admin-shop-staff-candidates",
    ),
    path(
        "admin/shops/<uuid:pk>/remedies/",
        views.AdminShopRemedyListView.as_view(),
        name="admin-shop-remedies",
    ),
    path(
        "admin/shop-remedies/<uuid:pk>/",
        views.AdminShopRemedyDetailView.as_view(),
        name="admin-shop-remedy-detail",
    ),
]
