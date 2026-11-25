import type { PatientMessages } from "@/i18n/messages/patient";

export type PatientTab = {
  href: string;
  label: keyof PatientMessages;
  /** SVG path drawn in a 24px box. */
  icon: string;
};

/** The five patient browse pages, shared by the bottom tab bar and the desktop top bar. */
export const PATIENT_TABS: readonly PatientTab[] = [
  {
    href: "/",
    label: "patient.tab.home",
    icon: "M3 10.5L12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z",
  },
  {
    href: "/remedies",
    label: "patient.tab.remedies",
    icon: "M9 2h6v4H9zM8 6h8l1 3v11a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V9zM10 13h4",
  },
  {
    href: "/care",
    label: "patient.tab.care",
    icon: "M9 3h6v3H9zM7 5H5v16h14V5h-2M9 12h6M9 16h4",
  },
  {
    href: "/orders",
    label: "patient.tab.orders",
    icon: "M21 8l-9-5-9 5v8l9 5 9-5zM3 8l9 5 9-5M12 13v8",
  },
  {
    href: "/profile",
    label: "patient.tab.profile",
    icon: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  },
];
