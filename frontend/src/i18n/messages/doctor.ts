import { defineCatalog } from "../catalog";

export const doctor = defineCatalog({
  en: {
    "doctor.area": "Doctor area",
    "doctor.nav.queue": "Patient queue",
    "doctor.nav.patients": "Patients",
    "doctor.queue.title": "Patient queue",
    "doctor.patients.title": "Patients",
  },
  bn: {
    "doctor.area": "ডাক্তারের এলাকা",
    "doctor.nav.queue": "রোগীর তালিকা",
    "doctor.nav.patients": "রোগীরা",
    "doctor.queue.title": "রোগীর তালিকা",
    "doctor.patients.title": "রোগীরা",
  },
});

export type DoctorMessages = (typeof doctor)["en"];
