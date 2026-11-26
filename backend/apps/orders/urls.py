from django.urls import path

from . import views

urlpatterns = [
    path("cart/", views.CartView.as_view(), name="cart-read"),
    path("cart/items/", views.CartItemAddView.as_view(), name="cart-item-add"),
    path(
        "cart/items/<uuid:pk>/",
        views.CartItemDetailView.as_view(),
        name="cart-item-detail",
    ),
    path("orders/quote/", views.OrderQuoteView.as_view(), name="order-quote"),
    path("orders/", views.OrderListCreateView.as_view(), name="order-list-create"),
    path("orders/<uuid:pk>/", views.OrderDetailView.as_view(), name="order-detail"),
    path("orders/<uuid:pk>/cancel/", views.OrderCancelView.as_view(), name="order-cancel"),
]
