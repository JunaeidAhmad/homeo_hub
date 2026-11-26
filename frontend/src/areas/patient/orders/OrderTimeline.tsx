"use client";

import type { components } from "@/api/schema";
import type { Locale } from "@/i18n/config";
import type { PatientMessages } from "@/i18n/messages/patient";
import { useMessages } from "@/i18n/provider";

import type { OrderStatus } from "./status";

type TimelineEntry = components["schemas"]["OrderTimelineEntry"];

const STEPS: { key: "confirmed" | "packing" | "shipped" | "delivered"; statuses: OrderStatus[] }[] = [
  { key: "confirmed", statuses: ["CONFIRMED", "PAID"] },
  { key: "packing", statuses: ["PROCESSING"] },
  { key: "shipped", statuses: ["SHIPPED"] },
  { key: "delivered", statuses: ["DELIVERED"] },
];

function stepIndexFor(status: OrderStatus): number {
  if (status === "PENDING_PAYMENT") return 0;
  const idx = STEPS.findIndex((step) => step.statuses.includes(status));
  return idx;
}

function formatWhen(locale: Locale, iso: string): string {
  try {
    return new Intl.DateTimeFormat(locale === "bn" ? "bn-BD" : "en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function OrderTimeline({
  status,
  timeline,
}: {
  status: OrderStatus;
  timeline: TimelineEntry[];
}) {
  const { locale, t } = useMessages<PatientMessages>();
  const isTerminalStop = status === "CANCELLED" || status === "RETURNED";
  const terminalEntry = isTerminalStop
    ? [...timeline].reverse().find((entry) => entry.status === status)
    : undefined;

  const currentIdx = stepIndexFor(status);
  const completedCount = (() => {
    if (!isTerminalStop) return currentIdx;
    // Count how many forward steps happened before cancellation/return.
    let highest = 0;
    for (const entry of timeline) {
      const idx = stepIndexFor(entry.status);
      if (idx >= 0) highest = Math.max(highest, idx + 1);
    }
    return highest;
  })();

  return (
    <ol className="flex flex-col gap-0">
      {STEPS.map((step, index) => {
        const entry = timeline.find((row) => step.statuses.includes(row.status));
        if (isTerminalStop && index >= completedCount) {
          return null;
        }
        const done =
          status === "DELIVERED" ||
          (isTerminalStop ? index < completedCount : index < currentIdx);
        const current = !isTerminalStop && index === currentIdx && status !== "DELIVERED";

        return (
          <li key={step.key} className="flex gap-3 pb-4 last:pb-0">
            <div className="flex flex-col items-center pt-1">
              <span
                className={`size-3.5 rounded-full ${
                  done
                    ? "bg-primary"
                    : current
                      ? "border-2 border-primary bg-surface ring-3 ring-primary/20"
                      : "border-2 border-line-strong bg-surface"
                }`}
              />
              {(index < STEPS.length - 1 && !isTerminalStop) || isTerminalStop ? (
                <span className="mt-1 w-0.5 flex-1 bg-line" />
              ) : null}
            </div>
            <div className="flex min-w-0 flex-col pb-1">
              <span
                className={`text-base ${
                  done || current ? "font-semibold text-ink" : "text-ink-muted"
                }`}
              >
                {t(`patient.orders.step.${step.key}`)}
              </span>
              {entry && (
                <span className="text-sm text-ink-muted">{formatWhen(locale, entry.at)}</span>
              )}
            </div>
          </li>
        );
      })}

      {isTerminalStop && (
        <li className="flex gap-3">
          <div className="flex flex-col items-center pt-1">
            <span
              className={`size-3.5 rounded-full ${
                status === "CANCELLED" ? "bg-danger" : "bg-ink-muted"
              }`}
            />
          </div>
          <div className="flex min-w-0 flex-col">
            <span
              className={`text-base font-semibold ${
                status === "CANCELLED" ? "text-danger" : "text-ink-muted"
              }`}
            >
              {t(`patient.orders.status.${status}`)}
            </span>
            {terminalEntry && (
              <span className="text-sm text-ink-muted">
                {formatWhen(locale, terminalEntry.at)}
              </span>
            )}
          </div>
        </li>
      )}
    </ol>
  );
}
