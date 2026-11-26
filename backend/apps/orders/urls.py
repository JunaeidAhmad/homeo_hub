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
    path("admin/orders/", views.AdminOrderListView.as_view(), name="admin-orders"),
    path(
        "admin/orders/<uuid:pk>/",
        views.AdminOrderDetailView.as_view(),
        name="admin-order-detail",
    ),
    path(
        "admin/orders/<uuid:pk>/items/<uuid:item_id>/candidates/",
        views.AdminOrderItemCandidatesView.as_view(),
        name="admin-order-item-candidates",
    ),
    path(
        "admin/orders/<uuid:pk>/items/<uuid:item_id>/assign/",
        views.AdminOrderItemAssignView.as_view(),
        name="admin-order-item-assign",
    ),
    path(
        "admin/shop-assignments/<uuid:pk>/status/",
        views.AdminShopAssignmentStatusView.as_view(),
        name="admin-shop-assignment-status",
    ),
    path(
        "admin/orders/<uuid:pk>/cancel/",
        views.AdminOrderCancelView.as_view(),
        name="admin-order-cancel",
    ),
]
