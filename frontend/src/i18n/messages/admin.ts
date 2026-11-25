import { defineCatalog } from "../catalog";

export const admin = defineCatalog({
  en: {
    "admin.area": "Admin",
    "admin.nav.overview": "Overview",
    "admin.nav.doctors": "Doctors",
    "admin.nav.orders": "Orders",
    "admin.nav.locations": "Locations",
    "admin.overview.title": "Overview",
    "admin.doctors.title": "Doctors",
    "admin.orders.title": "Orders",
    "admin.locations.title": "Locations",
    "admin.locations.division": "Division",
    "admin.locations.district": "District",
    "admin.locations.upazila": "Upazila",
  },
  bn: {
    "admin.area": "অ্যাডমিন",
    "admin.nav.overview": "সারসংক্ষেপ",
    "admin.nav.doctors": "ডাক্তার",
    "admin.nav.orders": "অর্ডার",
    "admin.nav.locations": "এলাকা",
    "admin.overview.title": "সারসংক্ষেপ",
    "admin.doctors.title": "ডাক্তার",
    "admin.orders.title": "অর্ডার",
    "admin.locations.title": "এলাকা",
    "admin.locations.division": "বিভাগ",
    "admin.locations.district": "জেলা",
    "admin.locations.upazila": "উপজেলা",
  },
});

export type AdminMessages = (typeof admin)["en"];
