import { defineCatalog } from "../catalog";

export const common = defineCatalog({
  en: {
    "app.tagline": "Natural · Holistic · Healing · Cure",
    "app.description": "Homeopathy care: self care and doctor consultations.",
    "lang.label": "Language",
    "nav.main": "Main",
    "nav.menu": "Menu",
    "nav.back": "Back",
    "placeholder.comingSoon": "This page is coming soon.",
    "health.ready": "API is ready",
    "health.degraded": "API is degraded",
    "health.unreachable": "API is unreachable",
    "health.database": "Database",
    "health.redis": "Redis",
    "health.ok": "ok",
    "health.error": "error",
    "health.checking": "Checking the API…",
  },
  bn: {
    "app.tagline": "প্রাকৃতিক · সামগ্রিক · নিরাময় · আরোগ্য",
    "app.description":
      "হোমিওপ্যাথি চিকিৎসা: নিজে ওষুধ বেছে নেওয়া এবং ডাক্তারের পরামর্শ।",
    "lang.label": "ভাষা",
    "nav.main": "প্রধান মেনু",
    "nav.menu": "মেনু",
    "nav.back": "পেছনে যান",
    "placeholder.comingSoon": "এই পাতাটি শিগগিরই আসছে।",
    "health.ready": "এপিআই প্রস্তুত",
    "health.degraded": "এপিআই আংশিক সচল",
    "health.unreachable": "এপিআই-এর সাথে যোগাযোগ করা যাচ্ছে না",
    "health.database": "ডেটাবেস",
    "health.redis": "রেডিস",
    "health.ok": "ঠিক আছে",
    "health.error": "ত্রুটি",
    "health.checking": "এপিআই যাচাই করা হচ্ছে…",
  },
});

export type CommonMessages = (typeof common)["en"];
