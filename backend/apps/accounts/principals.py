"""Finding the signed-in person without importing their model.

``settings.PRINCIPAL_LOADERS`` maps a user type to a function ``(subject_id) -> principal``
that returns None for a missing or disabled account.
"""

from typing import Any

from django.conf import settings
from django.utils.module_loading import import_string


def load_principal(user_type: str, subject_id: str) -> Any | None:
    loader = settings.PRINCIPAL_LOADERS.get(user_type)
    return import_string(loader)(subject_id) if loader else None
