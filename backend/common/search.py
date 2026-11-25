"""The list convention shared by every list endpoint.

    GET /api/v1/<things>/?q=&page=&page_size=&ordering=&<filters>

* ``q`` is keyword search over the view's ``search_fields``. Every word of the query
  must match some field, allowing for typos and half-typed words (trigram similarity),
  in Bangla or English. Rows containing all the words exactly (full-text) rank first,
  then by how closely the words match. ``ordering`` replaces that ranking.
* ``page`` / ``page_size``: see ``common.pagination``.
* ``ordering`` (``-`` for descending) accepts the view's ``ordering_fields``.

Performance: each search scans the table. Measured locally (6 fields): about 35 ms at
500 rows, 200 ms at 10,000, 1 s at 50,000. Before a list grows past ~10,000 rows, add
GIN ``gin_trgm_ops`` indexes and filter with the index-capable ``%>`` operator
(``__trigram_word_similar``), setting ``pg_trgm.word_similarity_threshold`` to
``MIN_SIMILARITY`` inside the same transaction (about 2 ms at 10,000 rows when tried).
"""

import unicodedata
from typing import Any

from django.contrib.postgres.search import SearchQuery, SearchVector, TrigramWordSimilarity
from django.db.models import Case, F, FloatField, QuerySet, Value, When
from django.db.models.functions import Greatest
from rest_framework.filters import BaseFilterBackend, OrderingFilter
from rest_framework.request import Request

SEARCH_PARAM = "q"
# Name of the ranking annotation, shared by the search filter and the ordering filter.
SEARCH_RANK = "search_rank"
# How alike a word must be to count as a typo of the query word (0 = anything, 1 = identical).
MIN_SIMILARITY = 0.4
# Added to the rank of rows that contain every query word exactly (full-text match).
EXACT_MATCH_BONUS = 1.0
# Bounds on the work one request can ask for (the endpoints are public).
MAX_QUERY_LENGTH = 100
MAX_WORDS = 6


def normalize_text(text: str) -> str:
    """One canonical Unicode form, so differently typed Bangla (য় vs য + nukta) compares equal.

    Also drops NUL bytes, which PostgreSQL text cannot hold.
    """
    return unicodedata.normalize("NFC", text).replace("\x00", "").strip()


class KeywordSearchFilter(BaseFilterBackend):
    """``?q=`` over ``view.search_fields``; annotates ``search_rank`` for ranking."""

    def filter_queryset(self, request: Request, queryset: QuerySet, view: Any) -> QuerySet:
        fields: list[str] = getattr(view, "search_fields", [])
        query = normalize_text(request.query_params.get(SEARCH_PARAM, ""))[:MAX_QUERY_LENGTH]
        words = query.split()[:MAX_WORDS]
        if not fields or not words:
            return queryset

        # Each word must be similar to something in one of the fields.
        scores = []
        for index, word in enumerate(words):
            similarities = [TrigramWordSimilarity(word, field) for field in fields]
            best = Greatest(*similarities) if len(similarities) > 1 else similarities[0]
            alias = f"search_word_{index}"
            queryset = queryset.alias(**{alias: best}).filter(**{f"{alias}__gte": MIN_SIMILARITY})
            scores.append(F(alias))

        average = sum(scores[1:], scores[0]) / Value(float(len(words)))
        # Words found together in one field beat the same words spread across fields.
        phrase = " ".join(words)
        together = [TrigramWordSimilarity(phrase, field) for field in fields]
        phrase_score = Greatest(*together) if len(together) > 1 else together[0]
        exact = Case(
            When(
                search_vector=SearchQuery(phrase, config="simple", search_type="plain"),
                then=Value(EXACT_MATCH_BONUS),
            ),
            default=Value(0.0),
            output_field=FloatField(),
        )
        return queryset.alias(search_vector=SearchVector(*fields, config="simple")).annotate(
            **{SEARCH_RANK: average + phrase_score + exact}
        )

    def get_schema_operation_parameters(self, view: Any) -> list[dict[str, Any]]:
        return [
            {
                "name": SEARCH_PARAM,
                "required": False,
                "in": "query",
                "description": "Keyword search (typo-tolerant, Bangla or English).",
                "schema": {"type": "string"},
            }
        ]


class RankedOrderingFilter(OrderingFilter):
    """``?ordering=``; while searching without one, keep best match first."""

    def filter_queryset(self, request: Request, queryset: QuerySet, view: Any) -> QuerySet:
        searching = SEARCH_RANK in queryset.query.annotations
        if searching and not request.query_params.get(self.ordering_param):
            tie_break = self.get_default_ordering(view) or ()
            return queryset.order_by(f"-{SEARCH_RANK}", *tie_break)
        return super().filter_queryset(request, queryset, view)
