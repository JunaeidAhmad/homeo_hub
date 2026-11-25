"use client";

import type { components } from "@/api/schema";
import type { AdminMessages } from "@/i18n/messages/admin";
import { useMessages } from "@/i18n/provider";

/** A role, drawn like the label on a dispensary vial. */
export function RoleLabel({ role }: { role: components["schemas"]["RoleEnum"] }) {
  const { t } = useMessages<AdminMessages>();
  return (
    <span className="inline-block rounded-sm border-[3px] border-double border-ink bg-surface px-2 py-0.5 text-[13px] leading-snug font-semibold">
      {t(`admin.role.${role}`)}
    </span>
  );
}
