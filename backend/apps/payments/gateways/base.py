"""Payment gateway protocol and data contracts."""

from dataclasses import dataclass
from typing import TYPE_CHECKING, Any, Protocol

if TYPE_CHECKING:
    from apps.payments.models import Payment


@dataclass(frozen=True)
class GatewayUrls:
    ipn_url: str
    success_url: str
    fail_url: str
    cancel_url: str


@dataclass(frozen=True)
class InitiateResult:
    session_key: str
    gateway_url: str
    raw: dict[str, Any]


@dataclass(frozen=True)
class IpnData:
    tran_id: str
    val_id: str
    status: str
    raw: dict[str, Any]


@dataclass(frozen=True)
class RedirectData:
    tran_id: str
    outcome: str
    raw: dict[str, Any]


@dataclass(frozen=True)
class Validation:
    status: str
    tran_id: str
    amount_poisha: int
    currency: str
    raw: dict[str, Any]


@dataclass(frozen=True)
class RefundResult:
    ok: bool
    refund_ref: str
    raw: dict[str, Any]


class PaymentGateway(Protocol):
    name: str

    def initiate(self, payment: "Payment", urls: GatewayUrls) -> InitiateResult: ...

    def parse_ipn(self, data: dict[str, Any]) -> IpnData: ...

    def parse_redirect(self, data: dict[str, Any]) -> RedirectData: ...

    def validate(self, val_id: str) -> Validation: ...

    def query(self, tran_id: str) -> Validation | None: ...

    def refund(self, payment: "Payment", amount_poisha: int) -> RefundResult: ...
