from django.urls import path

from .views import DistrictListView, DivisionListView, LocationListView

urlpatterns = [
    path("", LocationListView.as_view(), name="location-list"),
    path("divisions/", DivisionListView.as_view(), name="location-divisions"),
    path("districts/", DistrictListView.as_view(), name="location-districts"),
]
