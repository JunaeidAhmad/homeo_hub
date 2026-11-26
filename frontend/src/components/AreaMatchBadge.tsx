"use client";

import type { components } from "@/api/schema";
import type { AdminMessages } from "@/i18n/messages/admin";
import { useMessages } from "@/i18n/provider";

export type AreaMatch = components["schemas"]["AreaMatchEnum"];

const MATCH_CLASS: Record<AreaMatch, string> = {
  UPAZILA: "bg-mist text-primary font-semibold",
  DISTRICT: "bg-mist text-primary-deep",
  DIVISION: "bg-mist text-ink-soft",
  OTHER: "bg-mist text-ink-muted",
};

/** Badge showing how closely a shop or doctor's area matches the request area. */
export function AreaMatchBadge({ match }: { match: AreaMatch }) {
  const { t } = useMessages<AdminMessages>();
  return (
    <span className={`rounded-control px-2 py-0.5 text-xs ${MATCH_CLASS[match]}`}>
      {t(`admin.orders.match.${match}`)}
    </span>
  );
}
