"""Mock SSLCommerz-like payment gateway backed by MockGatewaySession."""

import secrets
from typing import Any

from apps.payments.models import MockGatewaySession, Payment

from .base import (
    GatewayUrls,
    InitiateResult,
    IpnData,
    RedirectData,
    RefundResult,
    Validation,
)


class MockGateway:
    name = "mock"

    def initiate(self, payment: Payment, urls: GatewayUrls) -> InitiateResult:
        session_key = f"MOCK-{secrets.token_hex(12)}"
        MockGatewaySession.objects.create(
            session_key=session_key,
            tran_id=payment.tran_id,
            amount_poisha=payment.amount_poisha,
            currency=payment.currency,
            return_url=urls.success_url,
        )
        gateway_url = f"/api/v1/payments/mock/checkout/{session_key}/"
        return InitiateResult(
            session_key=session_key,
            gateway_url=gateway_url,
            raw={"session_key": session_key, "gateway_url": gateway_url},
        )

    def parse_ipn(self, data: dict[str, Any]) -> IpnData:
        tran_id = str(data.get("tran_id", "")).strip()
        val_id = str(data.get("val_id", "")).strip()
        status = str(data.get("status", "")).strip().upper()
        if not tran_id or not status:
            raise ValueError("Missing tran_id or status.")
        return IpnData(tran_id=tran_id, val_id=val_id, status=status, raw=dict(data))

    def parse_redirect(self, data: dict[str, Any]) -> RedirectData:
        tran_id = str(data.get("tran_id", "")).strip()
        outcome = str(data.get("outcome") or data.get("status") or "").strip().upper()
        if not tran_id:
            raise ValueError("Missing tran_id.")
        return RedirectData(tran_id=tran_id, outcome=outcome, raw=dict(data))

    def validate(self, val_id: str) -> Validation:
        # A blank val_id must never match a session that has not been paid yet.
        session = MockGatewaySession.objects.filter(val_id=val_id).first() if val_id else None
        if session is None:
            return Validation(
                status="INVALID",
                tran_id="",
                amount_poisha=0,
                currency="BDT",
                raw={"val_id": val_id, "found": False},
            )
        return Validation(
            status=session.outcome or "PENDING",
            tran_id=session.tran_id,
            amount_poisha=session.amount_poisha,
            currency=session.currency,
            raw={
                "session_key": session.session_key,
                "val_id": session.val_id,
                "status": session.outcome,
                "amount_poisha": session.amount_poisha,
                "currency": session.currency,
            },
        )

    def query(self, tran_id: str) -> Validation | None:
        session = MockGatewaySession.objects.filter(tran_id=tran_id).order_by("-created_at").first()
        if session is None or not session.outcome:
            return None
        return Validation(
            status=session.outcome,
            tran_id=session.tran_id,
            amount_poisha=session.amount_poisha,
            currency=session.currency,
            raw={
                "session_key": session.session_key,
                "val_id": session.val_id,
                "status": session.outcome,
                "amount_poisha": session.amount_poisha,
                "currency": session.currency,
            },
        )

    def refund(self, payment: Payment, amount_poisha: int) -> RefundResult:
        ref = f"MOCK-REF-{secrets.token_hex(6)}"
        return RefundResult(
            ok=True,
            refund_ref=ref,
            raw={"tran_id": payment.tran_id, "amount_poisha": amount_poisha, "refund_ref": ref},
        )
