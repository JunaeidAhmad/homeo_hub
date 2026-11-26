"""Scrub clinical free-text fields from Django exception reports and logs."""

import re
from typing import Any

from django.views.debug import SafeExceptionReporterFilter

CLINICAL_FIELDS: set[str] = {
    "family_conditions",
    "family_notes",
    "chronic_conditions",
    "current_medications",
    "allergies",
    "temperament",
    "fears_anxieties",
    "emotional_notes",
    "thermal_preference",
    "appetite_thirst",
    "sleep_dreams",
    "general_notes",
    "food_cravings",
    "food_aversions",
    "weather_modalities",
    "chief_complaint",
    "symptoms",
    "symptom_notes",
    "cancel_reason",
    "prompt",
    "help_text",
    "answer",
    "answers",
    "value_json",
    "note",
}

_CLINICAL_REGEX = re.compile("|".join(sorted(CLINICAL_FIELDS)), flags=re.IGNORECASE)


class SensitiveDataFilter(SafeExceptionReporterFilter):
    """Cleanses patient clinical fields alongside Django's default secret filter."""

    def get_post_parameters(self, request: Any) -> Any:
        filtered = super().get_post_parameters(request)
        cleansed = filtered.copy() if hasattr(filtered, "copy") else dict(filtered)
        for key in list(cleansed):
            if _CLINICAL_REGEX.search(str(key)):
                cleansed[key] = self.cleansed_substitute
        return cleansed
