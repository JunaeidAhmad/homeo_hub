"""Platform fee calculation in integer poisha."""

from django.conf import settings


def platform_fee_for(doctor_fee_poisha: int) -> int:
    """Compute the platform fee from settings (fixed poisha or basis points of doctor fee)."""
    mode = str(getattr(settings, "PLATFORM_FEE_MODE", "FIXED")).strip().upper()
    value = max(0, int(getattr(settings, "PLATFORM_FEE_VALUE", 0) or 0))
    if mode == "PERCENT":
        # Basis points: 100 bps = 1%, 10000 bps = 100%.
        return (max(0, doctor_fee_poisha) * value) // 10_000
    return value
