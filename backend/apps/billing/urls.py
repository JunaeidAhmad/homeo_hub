from django.urls import path

from . import views

urlpatterns = [
    path(
        "admin/invoices/",
        views.AdminInvoiceListView.as_view(),
        name="admin-invoices-list",
    ),
    path(
        "admin/invoices/<uuid:pk>/waive/",
        views.AdminInvoiceWaiveView.as_view(),
        name="admin-invoices-waive",
    ),
    path(
        "admin/invoices/<uuid:pk>/close/",
        views.AdminInvoiceCloseView.as_view(),
        name="admin-invoices-close",
    ),
]
