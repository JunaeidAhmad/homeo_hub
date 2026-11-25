from rest_framework.pagination import PageNumberPagination


class StandardPagination(PageNumberPagination):
    """``?page=&page_size=`` for every list: 20 by default, never more than 100."""

    page_size = 20
    page_size_query_param = "page_size"
    max_page_size = 100
