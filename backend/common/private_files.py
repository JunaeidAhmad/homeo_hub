"""Private uploads (doctor certificates, consultation photos) with short-lived signed links."""

from dataclasses import dataclass
from uuid import uuid4

from django.conf import settings
from django.core.files.base import ContentFile
from django.core.files.storage import storages
from django.core.files.uploadedfile import UploadedFile
from django.core.signing import BadSignature, SignatureExpired, TimestampSigner
from django.http import FileResponse, Http404, HttpRequest
from rest_framework.exceptions import ErrorDetail, ValidationError
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.views import APIView

from common.images import StorageNotConfigured, process_picture

DEFAULT_MAX_BYTES = 10 * 1024 * 1024  # 10 MB
_SIGNER_SALT = "homeohub.private-files"


@dataclass(frozen=True)
class StoredPrivateFile:
    name: str
    content_type: str
    size: int


def _refuse(field: str, code: str, message: str) -> ValidationError:
    return ValidationError({field: [ErrorDetail(message, code=code)]})


def store_private(
    upload: UploadedFile,
    folder: str,
    *,
    field: str = "file",
    allowed: tuple[str, ...] = ("PDF", "JPEG", "PNG", "WEBP"),
    max_bytes: int = DEFAULT_MAX_BYTES,
) -> StoredPrivateFile:
    if not settings.UPLOADS_ENABLED:
        raise StorageNotConfigured()
    if upload.size is None or upload.size > max_bytes:
        raise _refuse(field, "file_too_large", "The file is larger than allowed.")

    head = upload.read(5)
    upload.seek(0)
    storage = storages["private"]

    if head == b"%PDF-":
        if "PDF" not in allowed:
            raise _refuse(field, "unsupported_type", "Use a JPEG, PNG or WebP picture.")
        raw = upload.read()
        path = storage.save(f"{folder.strip('/')}/{uuid4().hex}.pdf", ContentFile(raw))
        return StoredPrivateFile(name=path, content_type="application/pdf", size=len(raw))

    image_allowed = tuple(fmt for fmt in allowed if fmt != "PDF")
    if not image_allowed:
        raise _refuse(field, "unsupported_type", "Upload a PDF document.")
    processed = process_picture(upload, field=field)
    path = storage.save(f"{folder.strip('/')}/{processed.name}", processed)
    return StoredPrivateFile(name=path, content_type="image/webp", size=processed.size or 0)


def delete_private(name: str) -> None:
    if name:
        storages["private"].delete(name)


def signed_link(request: Request | HttpRequest | None, name: str, minutes: int = 5) -> str:
    signer = TimestampSigner(salt=_SIGNER_SALT)
    token = signer.sign(f"{minutes}:{name}")
    path = f"/api/v1/files/{token}/"
    return request.build_absolute_uri(path) if request is not None else path


class PrivateFileView(APIView):
    """Stream a private file if its short-lived token is valid."""

    authentication_classes: list = []
    permission_classes = [AllowAny]
    schema = None

    def get(self, request: Request, token: str):
        signer = TimestampSigner(salt=_SIGNER_SALT)
        try:
            unsigned = signer.unsign(token)
            minutes_str, name = unsigned.split(":", 1)
            max_age = int(minutes_str) * 60
            signer.unsign(token, max_age=max_age)
        except (BadSignature, SignatureExpired, ValueError) as error:
            raise Http404("File link is invalid or expired.") from error

        storage = storages["private"]
        if not storage.exists(name):
            raise Http404("File not found.")

        content_type = "application/pdf" if name.lower().endswith(".pdf") else "image/webp"
        response = FileResponse(storage.open(name, "rb"), content_type=content_type)
        response["X-Content-Type-Options"] = "nosniff"
        response["Cache-Control"] = "private, no-store"
        return response
