"""Bilingual notification templates and delivery channel rules.

Keep titles and bodies generic: never include symptoms, remedy names, or clinical text
in notifications or Web Push payloads.
"""

from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any

from .models import NotificationKind


@dataclass(frozen=True)
class NotificationTemplate:
    title_en: str
    title_bn: str
    body_en: str
    body_bn: str
    sms_mode: str = "never"  # "never" | "always" | "order_shipped_or_delivered"


CATALOG: dict[str, NotificationTemplate] = {
    NotificationKind.DOCTOR_ASSIGNED: NotificationTemplate(
        title_en="Doctor assigned",
        title_bn="ডাক্তার নির্ধারিত হয়েছে",
        body_en="Dr {doctor_name} has been assigned to consultation {code}.",
        body_bn="আপনার পরামর্শ {code}-এর জন্য ডা. {doctor_name} নির্ধারিত হয়েছেন।",
        sms_mode="always",
    ),
    NotificationKind.QUESTIONS_SENT: NotificationTemplate(
        title_en="Your doctor sent you questions",
        title_bn="আপনার ডাক্তার প্রশ্ন পাঠিয়েছেন",
        body_en="Please answer follow-up questions for consultation {code}.",
        body_bn="পরামর্শ {code}-এর ফলো-আপ প্রশ্নগুলোর উত্তর দিন।",
        sms_mode="always",
    ),
    NotificationKind.PATIENT_ANSWERED: NotificationTemplate(
        title_en="Patient answered questions",
        title_bn="রোগী প্রশ্নের উত্তর দিয়েছেন",
        body_en="New answers are ready to review for consultation {code}.",
        body_bn="পরামর্শ {code}-এর নতুন উত্তর পর্যালোচনার জন্য প্রস্তুত।",
        sms_mode="never",
    ),
    NotificationKind.PRESCRIPTION_READY: NotificationTemplate(
        title_en="Your prescription is ready",
        title_bn="আপনার ব্যবস্থাপত্র প্রস্তুত",
        body_en="Your doctor has issued a prescription for consultation {code}.",
        body_bn="আপনার পরামর্শ {code}-এর ব্যবস্থাপত্র তৈরি হয়েছে।",
        sms_mode="always",
    ),
    NotificationKind.PAYMENT_RESULT: NotificationTemplate(
        title_en="Payment update",
        title_bn="পেমেন্টের তথ্য",
        body_en="{message_en}",
        body_bn="{message_bn}",
        sms_mode="never",
    ),
    NotificationKind.ORDER_STATUS_CHANGED: NotificationTemplate(
        title_en="Order {code} updated",
        title_bn="অর্ডার {code} হালনাগাদ হয়েছে",
        body_en="Order {code} is now {status_en}.",
        body_bn="অর্ডার {code} এখন {status_bn} অবস্থায় আছে।",
        sms_mode="order_shipped_or_delivered",
    ),
    NotificationKind.CONSULTATION_WAITING: NotificationTemplate(
        title_en="New consultation waiting",
        title_bn="নতুন পরামর্শ অপেক্ষমাণ",
        body_en="Consultation {code} is waiting for a doctor assignment.",
        body_bn="পরামর্শ {code} ডাক্তার নির্ধারণের অপেক্ষায় আছে।",
        sms_mode="never",
    ),
    NotificationKind.DOCTOR_APPLICATION: NotificationTemplate(
        title_en="New doctor application",
        title_bn="নতুন ডাক্তার আবেদন",
        body_en="Doctor application from {name} is ready for review.",
        body_bn="{name}-এর ডাক্তার আবেদন পর্যালোচনার জন্য প্রস্তুত।",
        sms_mode="never",
    ),
}


class _SafeDict(dict):
    def __missing__(self, key: str) -> str:
        return ""


def render_message(kind: str, context: Mapping[str, Any]) -> tuple[str, str, str, str, bool]:
    template = CATALOG[kind]
    safe = _SafeDict(context)
    title_en = template.title_en.format_map(safe)[:160]
    title_bn = template.title_bn.format_map(safe)[:160]
    body_en = template.body_en.format_map(safe)[:500]
    body_bn = template.body_bn.format_map(safe)[:500]
    if template.sms_mode == "always":
        send_sms_flag = True
    elif template.sms_mode == "order_shipped_or_delivered":
        send_sms_flag = str(context.get("order_status", "")) in ("SHIPPED", "DELIVERED")
    else:
        send_sms_flag = False
    return title_en, title_bn, body_en, body_bn, send_sms_flag
