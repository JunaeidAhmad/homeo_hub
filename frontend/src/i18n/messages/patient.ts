import { defineCatalog } from "../catalog";

export const patient = defineCatalog({
  en: {
    "patient.tab.home": "Home",
    "patient.tab.remedies": "Remedies",
    "patient.tab.care": "My care",
    "patient.tab.orders": "Orders",
    "patient.tab.profile": "Profile",
    "patient.cart": "Cart",
    "patient.home.title": "How would you like to start feeling better?",
    "patient.remedies.title": "Find a remedy",
    "patient.care.title": "My care",
    "patient.orders.title": "Orders",
    "patient.profile.title": "Profile",
    "patient.cart.title": "Your cart",
    "patient.cart.checkout": "Go to checkout",
  },
  bn: {
    "patient.tab.home": "হোম",
    "patient.tab.remedies": "ওষুধ",
    "patient.tab.care": "চিকিৎসা",
    "patient.tab.orders": "অর্ডার",
    "patient.tab.profile": "প্রোফাইল",
    "patient.cart": "কার্ট",
    "patient.home.title": "কীভাবে ভালো হয়ে উঠতে চান?",
    "patient.remedies.title": "ওষুধ খুঁজুন",
    "patient.care.title": "আমার চিকিৎসা",
    "patient.orders.title": "অর্ডার",
    "patient.profile.title": "প্রোফাইল",
    "patient.cart.title": "আপনার কার্ট",
    "patient.cart.checkout": "চেকআউটে যান",
  },
});

export type PatientMessages = (typeof patient)["en"];
