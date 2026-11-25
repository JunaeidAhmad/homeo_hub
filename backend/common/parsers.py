from typing import Any

from rest_framework.exceptions import ParseError
from rest_framework.parsers import JSONParser

MAX_DEPTH = 10
UNREADABLE = "The request body could not be read."


def _check(value: Any, depth: int = 0) -> None:
    """Refuse bodies that would crash later: very deep nesting, broken Unicode."""
    if depth > MAX_DEPTH:
        raise ParseError(UNREADABLE)
    if isinstance(value, str):
        value.encode("utf-8")  # half a surrogate pair raises UnicodeEncodeError
    elif isinstance(value, dict):
        for key, item in value.items():
            _check(key, depth + 1)
            _check(item, depth + 1)
    elif isinstance(value, list):
        for item in value:
            _check(item, depth + 1)


class SafeJSONParser(JSONParser):
    """The only request format by default. Form posts are refused, so another website
    cannot submit to us with a plain HTML form."""

    def parse(self, stream, media_type=None, parser_context=None) -> Any:
        try:
            data = super().parse(stream, media_type, parser_context)
            _check(data)
        except (RecursionError, UnicodeError) as error:
            raise ParseError(UNREADABLE) from error
        return data
