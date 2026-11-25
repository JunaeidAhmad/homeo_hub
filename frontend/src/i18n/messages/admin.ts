import { defineCatalog } from "../catalog";

export const admin = defineCatalog({
  en: {
    "admin.area": "Admin",
    "admin.nav.overview": "Overview",
    "admin.nav.doctors": "Doctors",
    "admin.nav.orders": "Orders",
    "admin.overview.title": "Overview",
    "admin.doctors.title": "Doctors",
    "admin.orders.title": "Orders",
  },
  bn: {
    "admin.area": "অ্যাডমিন",
    "admin.nav.overview": "সারসংক্ষেপ",
    "admin.nav.doctors": "ডাক্তার",
    "admin.nav.orders": "অর্ডার",
    "admin.overview.title": "সারসংক্ষেপ",
    "admin.doctors.title": "ডাক্তার",
    "admin.orders.title": "অর্ডার",
  },
});

export type AdminMessages = (typeof admin)["en"];
