from common.errors import ApiError


class InvalidCredentials(ApiError):
    """One answer for every failed sign-in, so it never says which part was wrong."""

    status_code = 401
    error_code = "INVALID_CREDENTIALS"
    default_detail = "The sign-in details are not right."
