import type { components } from "@/api/schema";
import type { AdminMessages } from "@/i18n/messages/admin";
import { currentHref } from "@/lib/nav";

export type Permission = components["schemas"]["PermissionEnum"];

export type AdminSection = {
  href: string;
  label: keyof AdminMessages;
  /** Who sees it. Without one, every signed-in staff member does. Array means any-of. */
  permission?: Permission | readonly Permission[];
};

/**
 * The admin sections. Hiding a section is a convenience only: the API checks the same
 * permission on every request.
 */
export const ADMIN_NAV: readonly AdminSection[] = [
  { href: "/admin", label: "admin.nav.overview" },
  { href: "/admin/staff", label: "admin.nav.staff", permission: "manage_staff" },
  { href: "/admin/doctors", label: "admin.nav.doctors", permission: "view_doctors" },
  { href: "/admin/cases", label: "admin.nav.cases", permission: "view_cases" },
  { href: "/admin/remedies", label: "admin.nav.remedies", permission: "manage_remedies" },
  { href: "/admin/illnesses", label: "admin.nav.illnesses", permission: "manage_illnesses" },
  {
    href: "/admin/shops",
    label: "admin.nav.shops",
    permission: ["manage_shops", "manage_own_shop"],
  },
  { href: "/admin/orders", label: "admin.nav.orders", permission: "view_orders" },
  { href: "/admin/payments", label: "admin.nav.payments", permission: "view_payments" },
  { href: "/admin/locations", label: "admin.nav.locations" },
  { href: "/admin/audit", label: "admin.nav.audit", permission: "view_audit_log" },
];

const allows = (permissions: readonly Permission[], section: AdminSection) => {
  if (!section.permission) return true;
  const required = Array.isArray(section.permission) ? section.permission : [section.permission];
  return required.some((perm) => permissions.includes(perm));
};

export function visibleSections(permissions: readonly Permission[]): AdminSection[] {
  return ADMIN_NAV.filter((section) => allows(permissions, section));
}

/** Whether the page at `pathname` belongs to a section these permissions open. */
export function mayOpen(permissions: readonly Permission[], pathname: string): boolean {
  const href = currentHref(
    pathname,
    ADMIN_NAV.map((section) => section.href),
  );
  const section = ADMIN_NAV.find((candidate) => candidate.href === href);
  return !section || allows(permissions, section);
}
