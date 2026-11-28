"use client";

import type { components } from "@/api/schema";
import { StatusTimeline } from "@/components/StatusTimeline";
import type { PatientMessages } from "@/i18n/messages/patient";
import { useMessages } from "@/i18n/provider";

import type { OrderStatus } from "./status";

type TimelineEntry = components["schemas"]["OrderTimelineEntry"];

const STEPS: {
  key: "placed" | "confirmed" | "packing" | "shipped" | "delivered";
  statuses: OrderStatus[];
}[] = [
  // Placed and waiting for an admin to confirm it (and paid, for an online order).
  { key: "placed", statuses: ["PENDING", "PENDING_PAYMENT", "PAID"] },
  { key: "confirmed", statuses: ["CONFIRMED"] },
  { key: "packing", statuses: ["PROCESSING"] },
  { key: "shipped", statuses: ["SHIPPED"] },
  { key: "delivered", statuses: ["DELIVERED"] },
];

function stepIndexFor(status: OrderStatus): number {
  return STEPS.findIndex((step) => step.statuses.includes(status));
}

export function OrderTimeline({
  status,
  timeline,
}: {
  status: OrderStatus;
  timeline: TimelineEntry[];
}) {
  const { t } = useMessages<PatientMessages>();
  const isTerminalStop = status === "CANCELLED" || status === "RETURNED";
  const terminalEntry = isTerminalStop
    ? [...timeline].reverse().find((entry) => entry.status === status)
    : undefined;

  const currentIdx = stepIndexFor(status);
  const completedCount = (() => {
    if (!isTerminalStop) return currentIdx;
    let highest = 0;
    for (const entry of timeline) {
      const idx = stepIndexFor(entry.status);
      if (idx >= 0) highest = Math.max(highest, idx + 1);
    }
    return highest;
  })();

  const reachedCount = isTerminalStop ? completedCount : currentIdx + 1;
  const steps = STEPS.map((step, index) => {
    // The first history row is the order being placed, whatever status it started in.
    const entry =
      index === 0 ? timeline[0] : timeline.find((row) => step.statuses.includes(row.status));
    return {
      key: step.key,
      label: t(`patient.orders.step.${step.key}`),
      // Only steps the order has reached get a time (older orders may carry other rows).
      timestamp: index < reachedCount ? (entry?.at ?? null) : null,
    };
  });

  return (
    <StatusTimeline
      steps={steps}
      currentIndex={isTerminalStop ? completedCount : currentIdx}
      allDone={status === "DELIVERED"}
      terminalStop={
        isTerminalStop
          ? {
              label: t(`patient.orders.status.${status}`),
              tone: status === "CANCELLED" ? "danger" : "muted",
              timestamp: terminalEntry?.at ?? null,
            }
          : null
      }
    />
  );
}
