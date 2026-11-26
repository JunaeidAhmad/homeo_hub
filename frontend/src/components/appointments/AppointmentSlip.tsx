"use client";

import { useEffect, useState } from "react";

import type { components } from "@/api/schema";
import type { Locale } from "@/i18n/config";
import { fill } from "@/i18n/catalog";
import { formatDateTime, formatTime, numberFormat } from "@/i18n/format";

export type AppointmentStatus = components["schemas"]["AppointmentStatusEnum"];

export type SlipLabels = {
  duration: string;
  statusText: string;
  relInHours: string;
  relInHour: string;
  relInMinutes: string;
  relInMinute: string;
  relNow: string;
  relPast: string;
};

const STATUS_COLOR: Record<AppointmentStatus, string> = {
  PROPOSED: "text-amber",
  RESCHEDULE_REQUESTED: "text-amber",
  ACCEPTED: "text-primary-deep",
  IN_PROGRESS: "text-primary",
  COMPLETED: "text-primary-deep",
  REJECTED: "text-ink-muted",
  EXPIRED: "text-ink-muted",
  NO_SHOW: "text-ink-muted",
  CANCELLED: "text-ink-muted",
};

function formatCountdown(
  locale: Locale,
  startIso: string,
  nowMs: number,
  labels: SlipLabels,
): string {
  const diffMin = Math.round((new Date(startIso).getTime() - nowMs) / 60_000);
  if (diffMin < -5) return labels.relPast;
  if (diffMin <= 0) return labels.relNow;
  const nf = numberFormat(locale);
  if (diffMin < 60) {
    if (diffMin === 1) return labels.relInMinute;
    return fill(labels.relInMinutes, { count: nf.format(diffMin) });
  }
  const hours = Math.round(diffMin / 60);
  if (hours === 1) return labels.relInHour;
  return fill(labels.relInHours, { count: nf.format(hours) });
}

export function AppointmentSlip({
  locale,
  startAt,
  endAt,
  status,
  labels,
  headerNote,
  footerNote,
}: {
  locale: Locale;
  startAt: string;
  endAt: string;
  status: AppointmentStatus;
  labels: SlipLabels;
  headerNote?: string;
  footerNote?: string;
}) {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const weekdayMonth = formatDateTime(locale, startAt, { weekday: "short", month: "short" });
  const dayNumber = formatDateTime(locale, startAt, { day: "numeric" });
  const timeRange = `${formatTime(locale, startAt)} – ${formatTime(locale, endAt)}`;
  const showCountdown =
    status === "PROPOSED" || status === "RESCHEDULE_REQUESTED" || status === "ACCEPTED";

  return (
    <div className="flex flex-col gap-3 rounded-panel border border-line-strong bg-surface p-4">
      {headerNote && <p className="text-xs font-semibold text-ink-muted">{headerNote}</p>}
      <div className="flex items-center gap-4">
        <div className="flex min-w-16 flex-col items-center rounded-control bg-mist px-3 py-2 text-center">
          <span className="text-xs font-semibold text-ink-muted">{weekdayMonth}</span>
          <span className="font-display text-[40px] leading-none font-normal text-ink">
            {dayNumber}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-lg font-semibold text-ink">{timeRange}</p>
          <p className="text-sm text-ink-soft">{labels.duration}</p>
          {showCountdown && (
            <p className="text-sm font-medium text-ink-muted">
              {formatCountdown(locale, startAt, nowMs, labels)}
            </p>
          )}
        </div>
      </div>

      <div className="border-t border-line pt-2.5">
        <p className={`text-sm font-semibold ${STATUS_COLOR[status]}`}>{labels.statusText}</p>
        {footerNote && <p className="mt-0.5 text-xs text-ink-muted">{footerNote}</p>}
      </div>
    </div>
  );
}
