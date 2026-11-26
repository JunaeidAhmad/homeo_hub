"""Generate a VAPID P-256 keypair for Web Push."""

import base64

from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat
from django.core.management.base import BaseCommand


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


class Command(BaseCommand):
    help = (
        "Generate a VAPID P-256 keypair for WEBPUSH_VAPID_PUBLIC_KEY and WEBPUSH_VAPID_PRIVATE_KEY."
    )

    def handle(self, *args, **options) -> None:
        private_key = ec.generate_private_key(ec.SECP256R1())
        priv_bytes = private_key.private_numbers().private_value.to_bytes(32, "big")
        pub_bytes = private_key.public_key().public_bytes(
            Encoding.X962, PublicFormat.UncompressedPoint
        )
        self.stdout.write(f"WEBPUSH_VAPID_PUBLIC_KEY={_b64url(pub_bytes)}")
        self.stdout.write(f"WEBPUSH_VAPID_PRIVATE_KEY={_b64url(priv_bytes)}")
