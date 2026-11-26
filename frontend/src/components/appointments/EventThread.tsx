"use client";

import type { components } from "@/api/schema";
import type { Locale } from "@/i18n/config";
import { formatDateTime } from "@/i18n/format";

export type AppointmentEventItem = components["schemas"]["AppointmentEvent"];

export function EventThread({
  locale,
  events,
  describeActor,
  describeKind,
}: {
  locale: Locale;
  events: AppointmentEventItem[];
  describeActor: (actorType: string) => string;
  describeKind: (kind: AppointmentEventItem["kind"]) => string;
}) {
  if (events.length === 0) return null;
  return (
    <ul className="flex flex-col gap-2">
      {events.map((ev) => {
        const alignRight = ev.actor_type === "patient";
        return (
          <li
            key={ev.id}
            className={`flex flex-col ${alignRight ? "items-end" : "items-start"}`}
          >
            <div className="max-w-[90%] rounded-control bg-mist px-3 py-2 text-sm text-ink">
              <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs text-ink-muted">
                <span className="font-semibold text-ink">{describeActor(ev.actor_type)}</span>
                <span>{formatDateTime(locale, ev.created_at)}</span>
              </div>
              <p className="mt-0.5 font-medium text-ink">{describeKind(ev.kind)}</p>
              {ev.proposed_start_at && (
                <p className="mt-1 rounded-control border border-line bg-surface px-2.5 py-1 text-xs font-semibold text-ink">
                  {formatDateTime(locale, ev.proposed_start_at)}
                </p>
              )}
              {ev.preferred_times.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {ev.preferred_times.map((iso) => (
                    <span
                      key={iso}
                      className="rounded-control border border-line bg-surface px-2 py-0.5 text-xs text-ink"
                    >
                      {formatDateTime(locale, iso)}
                    </span>
                  ))}
                </div>
              )}
              {ev.note && <p className="mt-1 whitespace-pre-line text-ink-soft">{ev.note}</p>}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
