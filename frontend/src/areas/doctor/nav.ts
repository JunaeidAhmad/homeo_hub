import type { DoctorMessages } from "@/i18n/messages/doctor";

export const DOCTOR_NAV: readonly {
  href: string;
  label: keyof DoctorMessages;
}[] = [
  { href: "/doctor", label: "doctor.nav.queue" },
  { href: "/doctor/patients", label: "doctor.nav.patients" },
];
