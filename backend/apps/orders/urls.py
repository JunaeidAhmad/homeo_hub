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
]
