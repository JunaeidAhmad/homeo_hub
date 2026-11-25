"""Pictures people upload (remedy photos now, profile pictures later).

A picture is checked by its content, never its file name, then redrawn as a WebP no
larger than needed. Redrawing drops hidden data such as the photo's GPS position.
"""

from io import BytesIO
from uuid import uuid4

from django.conf import settings
from django.core.files.base import ContentFile
from django.core.files.uploadedfile import UploadedFile
from PIL import Image, ImageOps
from rest_framework.exceptions import ErrorDetail, ValidationError

from common.errors import ApiError

ALLOWED_FORMATS = {"JPEG", "PNG", "WEBP"}
MAX_BYTES = 5 * 1024 * 1024
MAX_PIXELS = 40_000_000  # refuses "decompression bombs": tiny files that expand hugely
MAX_SIDE = 1200


class StorageNotConfigured(ApiError):
    status_code = 503
    error_code = "STORAGE_NOT_CONFIGURED"
    default_detail = "File uploads are not set up on this server."


def _refuse(field: str, code: str, message: str) -> ValidationError:
    return ValidationError({field: [ErrorDetail(message, code=code)]})


def process_picture(upload: UploadedFile, field: str = "picture") -> ContentFile:
    """The upload as a safe WebP file ready to store; raises ``ValidationError``."""
    if not settings.UPLOADS_ENABLED:
        raise StorageNotConfigured()
    if upload.size is None or upload.size > MAX_BYTES:
        raise _refuse(field, "file_too_large", "The picture must be 5 MB or smaller.")
    not_a_picture = _refuse(field, "not_an_image", "That file is not a readable picture.")
    try:
        with Image.open(upload) as image:
            if image.format not in ALLOWED_FORMATS:
                raise _refuse(field, "unsupported_type", "Use a JPEG, PNG or WebP picture.")
            if image.width * image.height > MAX_PIXELS:
                raise _refuse(field, "image_too_big", "The picture's dimensions are too large.")
            image.load()
            picture = ImageOps.exif_transpose(image)  # honour the camera's rotation
            if picture.mode not in ("RGB", "RGBA"):
                picture = picture.convert("RGBA" if "A" in picture.getbands() else "RGB")
            picture.thumbnail((MAX_SIDE, MAX_SIDE))
            output = BytesIO()
            picture.save(output, format="WEBP", quality=85)
    except ValidationError:
        raise
    except (OSError, SyntaxError, ValueError, Image.DecompressionBombError) as error:
        raise not_a_picture from error
    return ContentFile(output.getvalue(), name=f"{uuid4().hex}.webp")
