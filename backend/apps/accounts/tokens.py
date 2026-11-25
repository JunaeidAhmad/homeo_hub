"""Sessions: a short-lived signed access token plus a rotating refresh token.

The refresh token is a random string; only its hash is stored. Using it returns a new
one. Using an old one again (a copied token) ends the whole session.
"""

import hashlib
import secrets
import uuid
from dataclasses import dataclass
from datetime import timedelta

import jwt
from django.conf import settings
from django.db import connection, transaction
from django.utils import timezone

from common.errors import ApiError

from .models import RefreshToken
from .principals import load_principal

ACCESS_LIFETIME = timedelta(minutes=15)
# Unused sessions end after this long; each refresh starts the clock again.
REFRESH_LIFETIME = {"patient": timedelta(days=30)}
# Two tabs can present the same token at nearly the same moment.
CONCURRENT_USE_GRACE = timedelta(seconds=10)
ALGORITHM = "HS256"


class SessionExpired(ApiError):
    status_code = 401
    error_code = "SESSION_EXPIRED"
    default_detail = "Please sign in again."


class RefreshInProgress(ApiError):
    status_code = 401
    error_code = "REFRESH_IN_PROGRESS"
    default_detail = "This session was just refreshed. Try again."


@dataclass(frozen=True)
class Session:
    user_type: str
    access_token: str
    refresh_token: str

    @property
    def expires_in(self) -> int:
        return int(ACCESS_LIFETIME.total_seconds())

    @property
    def refresh_max_age(self) -> int:
        return int(REFRESH_LIFETIME[self.user_type].total_seconds())


def _digest(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


def _new_link(family: uuid.UUID, user_type: str, subject_id: str) -> Session:
    now = timezone.now()
    raw = secrets.token_urlsafe(32)
    RefreshToken.objects.create(
        family=family,
        user_type=user_type,
        subject_id=subject_id,
        token_hash=_digest(raw),
        expires_at=now + REFRESH_LIFETIME[user_type],
    )
    access = jwt.encode(
        {
            "typ": "access",
            "user_type": user_type,
            "user_id": subject_id,
            "sid": str(family),
            "iat": now,
            "exp": now + ACCESS_LIFETIME,
        },
        settings.SECRET_KEY,
        algorithm=ALGORITHM,
    )
    return Session(user_type=user_type, access_token=access, refresh_token=raw)


def _lock_sessions_of(user_type: str, subject_id: str) -> None:
    """Refreshing and ending sessions take turns, per person, until the transaction ends.

    Without this, a sign-out could miss the token a refresh is creating at that moment.
    """
    with connection.cursor() as cursor:
        cursor.execute(
            "SELECT pg_advisory_xact_lock(hashtext(%s))", [f"session:{user_type}:{subject_id}"]
        )


def open_session(user_type: str, subject_id: str) -> Session:
    return _new_link(uuid.uuid4(), user_type, subject_id)


def rotate(raw: str) -> Session:
    """Exchange a refresh token for a new session link."""
    error: ApiError | None = None
    session: Session | None = None
    with transaction.atomic():
        found = RefreshToken.objects.filter(token_hash=_digest(raw)).first()
        link = None
        if found:
            _lock_sessions_of(found.user_type, found.subject_id)
            link = RefreshToken.objects.select_for_update().get(pk=found.pk)
        now = timezone.now()
        if link is None or link.revoked_at or link.expires_at <= now:
            error = SessionExpired()
        elif link.rotated_at and now - link.rotated_at <= CONCURRENT_USE_GRACE:
            error = RefreshInProgress()
        elif link.rotated_at or load_principal(link.user_type, link.subject_id) is None:
            _revoke(RefreshToken.objects.filter(family=link.family))
            error = SessionExpired()
        else:
            link.rotated_at = now
            link.save(update_fields=["rotated_at"])
            session = _new_link(link.family, link.user_type, link.subject_id)
    if error:
        raise error  # after the transaction, so a revocation is kept
    assert session is not None
    return session


def _revoke(links) -> None:
    links.filter(revoked_at__isnull=True).update(revoked_at=timezone.now())


@transaction.atomic
def close_session(raw: str) -> None:
    link = RefreshToken.objects.filter(token_hash=_digest(raw)).first()
    if link:
        _lock_sessions_of(link.user_type, link.subject_id)
        _revoke(RefreshToken.objects.filter(family=link.family))


@transaction.atomic
def close_all_sessions(user_type: str, subject_id: str) -> None:
    _lock_sessions_of(user_type, subject_id)
    _revoke(RefreshToken.objects.filter(user_type=user_type, subject_id=subject_id))


def read_access_token(token: str) -> dict:
    """The claims of a genuine, unexpired access token; raises ``jwt.InvalidTokenError``."""
    claims = jwt.decode(
        token,
        settings.SECRET_KEY,
        algorithms=[ALGORITHM],
        options={"require": ["exp", "user_id", "user_type", "sid"], "verify_iat": False},
    )
    if claims.get("typ") != "access":
        raise jwt.InvalidTokenError("not an access token")
    return claims


def session_is_open(family: str) -> bool:
    return RefreshToken.objects.filter(family=family, revoked_at__isnull=True).exists()
