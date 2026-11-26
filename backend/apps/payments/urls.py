from django.urls import path

from . import views

urlpatterns = [
    path("payments/", views.PaymentStartView.as_view(), name="payment-start"),
    path("payments/ipn/", views.PaymentIpnView.as_view(), name="payment-ipn"),
    path(
        "payments/mock/checkout/<str:session_key>/",
        views.MockGatewayCheckoutView.as_view(),
        name="payment-mock-checkout",
    ),
    path("payments/<str:tran_id>/", views.PaymentStatusView.as_view(), name="payment-status"),
    path("admin/payments/", views.AdminPaymentListView.as_view(), name="admin-payments"),
]
