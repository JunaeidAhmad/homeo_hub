"""On-read reminder hook registry.

Other apps (such as appointment scheduling in ticket 24) append callables here at
AppConfig.ready(). The unread-count endpoint runs them for the caller before counting.
"""

import logging
from collections.abc import Callable

logger = logging.getLogger(__name__)

DUE_CHECKS: list[Callable[[str, str], None]] = []


def run_due_checks(recipient_type: str, recipient_id: str) -> None:
    for check in DUE_CHECKS:
        try:
            check(recipient_type, recipient_id)
        except Exception:
            logger.warning("Notification due check failed", exc_info=True)
