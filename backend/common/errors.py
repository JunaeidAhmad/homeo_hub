"""One error shape for the whole API (docs/02-system-design.md §6.1)::

    {"error": {"code": "OTP_INVALID", "message": "...", "details": {...}, "request_id": "..."}}

Clients act on ``code`` (and translate it); ``message`` is for developers and logs.
"""

import math
from typing import Any

from django.http import HttpRequest, JsonResponse
from rest_framework import exceptions
from rest_framework.response import Response


class ApiError(exceptions.APIException):
    """Raise a subclass for anything a client may need to react to."""

    status_code = 400
    error_code = "BAD_REQUEST"
    default_detail = "The request could not be processed."

    def __init__(self, details: dict[str, Any] | None = None, message: str | None = None) -> None:
        super().__init__(message or self.default_detail)
        self.details = details or {}


_STANDARD_CODES: list[tuple[type[exceptions.APIException], str]] = [
    (exceptions.ValidationError, "VALIDATION_ERROR"),
    (exceptions.NotAuthenticated, "NOT_AUTHENTICATED"),
    (exceptions.AuthenticationFailed, "NOT_AUTHENTICATED"),
    (exceptions.PermissionDenied, "PERMISSION_DENIED"),
    (exceptions.NotFound, "NOT_FOUND"),
    (exceptions.MethodNotAllowed, "METHOD_NOT_ALLOWED"),
    (exceptions.ParseError, "PARSE_ERROR"),
    (exceptions.UnsupportedMediaType, "UNSUPPORTED_MEDIA_TYPE"),
    (exceptions.Throttled, "RATE_LIMITED"),
]


def _problems(details: Any) -> Any:
    """DRF's nested error details as ``{"field": [{"code", "message"}]}``."""
    if isinstance(details, list):
        return [_problems(item) for item in details]
    if set(details) == {"message", "code"}:
        return details
    return {field: _problems(value) for field, value in details.items()}


def exception_handler(exc: Exception, context: dict[str, Any]) -> Response | None:
    # Imported here: rest_framework.views loads the authentication classes, which use ApiError.
    from rest_framework.views import exception_handler as drf_exception_handler

    response = drf_exception_handler(exc, context)
    if response is None:
        return None  # a bug: let Django report it

    code, message, details = "ERROR", "", {}
    if isinstance(exc, ApiError):
        code, message, details = exc.error_code, str(exc.detail), exc.details
    else:
        data = response.data
        message = str(data.get("detail", "")) if isinstance(data, dict) else ""
        for kind, name in _STANDARD_CODES:
            if isinstance(exc, kind) or (
                kind is exceptions.NotFound and response.status_code == 404
            ):
                code = name
                break
        if isinstance(exc, exceptions.ValidationError):
            message = "Some fields are not valid."
            full = exc.get_full_details()
            details = _problems(full if isinstance(full, dict) else {"non_field_errors": full})
        elif isinstance(exc, exceptions.Throttled) and (wait := getattr(exc, "wait", None)):
            details = {"retry_after": math.ceil(wait)}

    request = context.get("request")
    response.data = {
        "error": {
            "code": code,
            "message": message,
            "details": details,
            "request_id": getattr(request, "request_id", ""),
        }
    }
    return response


def _plain_error(request: HttpRequest, status: int, code: str, message: str) -> JsonResponse:
    """The same shape for errors that never reach a view."""
    error: dict[str, object] = {
        "code": code,
        "message": message,
        "details": {},
        "request_id": getattr(request, "request_id", ""),
    }
    return JsonResponse({"error": error}, status=status)


def not_found(request: HttpRequest, exception: Exception | None = None) -> JsonResponse:
    return _plain_error(request, 404, "NOT_FOUND", "There is nothing at this address.")


def server_error(request: HttpRequest) -> JsonResponse:
    return _plain_error(request, 500, "SERVER_ERROR", "Something went wrong on our side.")
