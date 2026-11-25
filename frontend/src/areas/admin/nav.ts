import type { AdminMessages } from "@/i18n/messages/admin";

export const ADMIN_NAV: readonly {
  href: string;
  label: keyof AdminMessages;
}[] = [
  { href: "/admin", label: "admin.nav.overview" },
  { href: "/admin/doctors", label: "admin.nav.doctors" },
  { href: "/admin/orders", label: "admin.nav.orders" },
];
