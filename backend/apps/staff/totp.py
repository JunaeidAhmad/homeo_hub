"""RFC 6238 TOTP (SHA-1, 30s, 6 digits) and Fernet secret encryption using stdlib + cryptography."""

from __future__ import annotations

import base64
import hashlib
import hmac
import io
import secrets
import struct
import time
from urllib.parse import quote

import segno
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from django.conf import settings

PERIOD_SECONDS = 30
DIGITS = 6
WINDOW_STEPS = 1


def _fernet() -> Fernet:
    hkdf = HKDF(
        algorithm=hashes.SHA256(),
        length=32,
        salt=b"homeohub-totp-v1",
        info=b"staff-totp-secret",
    )
    key = base64.urlsafe_b64encode(hkdf.derive(settings.SECRET_KEY.encode("utf-8")))
    return Fernet(key)


def encrypt_secret(secret: str) -> str:
    return _fernet().encrypt(secret.encode("ascii")).decode("ascii")


def decrypt_secret(token: str) -> str:
    return _fernet().decrypt(token.encode("ascii")).decode("ascii")


def generate_secret() -> str:
    # 20 random bytes -> 32-char base32 string (standard RFC 6238 / Google Authenticator secret).
    return base64.b32encode(secrets.token_bytes(20)).decode("ascii").rstrip("=")


def _hotp(secret: str, counter: int) -> str:
    padded = secret.upper() + "=" * ((8 - len(secret) % 8) % 8)
    key = base64.b32decode(padded, casefold=True)
    msg = struct.pack(">Q", counter)
    digest = hmac.new(key, msg, hashlib.sha1).digest()
    offset = digest[-1] & 0x0F
    code_int = struct.unpack(">I", digest[offset : offset + 4])[0] & 0x7FFFFFFF
    return f"{code_int % (10**DIGITS):0{DIGITS}d}"


def verify_totp(secret: str, code: str, *, now: float | None = None) -> int | None:
    """Return the matched time step if `code` is valid within ±1 step, else None."""
    cleaned = code.strip()
    if len(cleaned) != DIGITS or not cleaned.isdigit():
        return None
    ts = time.time() if now is None else now
    current_step = int(ts // PERIOD_SECONDS)
    for delta in (-WINDOW_STEPS, 0, WINDOW_STEPS):
        step = current_step + delta
        if step < 0:
            continue
        expected = _hotp(secret, step)
        if hmac.compare_digest(expected, cleaned):
            return step
    return None


def otpauth_uri_for(username: str, secret: str) -> str:
    issuer = "HomeoHub"
    label = quote(f"{issuer}:{username}")
    return (
        f"otpauth://totp/{label}?secret={secret}"
        f"&issuer={quote(issuer)}&algorithm=SHA1&digits={DIGITS}&period={PERIOD_SECONDS}"
    )


def render_qr_svg(uri: str) -> str:
    qr = segno.make(uri, error="M")
    buf = io.BytesIO()
    qr.save(buf, kind="svg", xmldecl=False, scale=5, border=2)
    return buf.getvalue().decode("utf-8")
