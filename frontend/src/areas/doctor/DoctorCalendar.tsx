"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import type { components } from "@/api/schema";
import { FormAlert, Heading } from "@/components/form/fields";
import { formatDateTime, formatTime, numberFormat } from "@/i18n/format";
import type { DoctorMessages } from "@/i18n/messages/doctor";
import { useMessages } from "@/i18n/provider";
import { dhakaDateValue, shiftDhakaDate, weekStartMonday } from "@/lib/dhaka";

import { useDoctorSession } from "./session";

type CalendarItem = components["schemas"]["DoctorCalendarItem"];

const HOURS = Array.from({ length: 14 }, (_, idx) => idx + 8); // 08:00..21:00 (up to 22:00)
const HOUR_HEIGHT = 48;

function minutesSince8am(iso: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Dhaka",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(iso));
  const rawHour = Number(parts.find((p) => p.type === "hour")?.value ?? 8);
  const hour = rawHour === 24 ? 0 : rawHour;
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return Math.max(0, (hour - 8) * 60 + minute);
}

function itemBorder(status: CalendarItem["status"]): string {
  if (status === "ACCEPTED" || status === "IN_PROGRESS" || status === "COMPLETED") {
    return "border-l-4 border-primary";
  }
  if (status === "PROPOSED" || status === "RESCHEDULE_REQUESTED") {
    return "border-l-4 border-amber";
  }
  return "border-l-4 border-line-strong";
}

export function DoctorCalendar() {
  const { locale, t } = useMessages<DoctorMessages>();
  const { api } = useDoctorSession();
  const nf = numberFormat(locale);

  const todayDhaka = dhakaDateValue(new Date());
  const [weekStart, setWeekStart] = useState(() => weekStartMonday(todayDhaka));
  const [agendaItems, setAgendaItems] = useState<CalendarItem[]>([]);
  const [weekItems, setWeekItems] = useState<CalendarItem[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    const controller = new AbortController();
    const agendaTo = shiftDhakaDate(todayDhaka, 14);
    api
      .GET("/api/v1/doctor/appointments/", {
        params: { query: { from: todayDhaka, to: agendaTo } },
        signal: controller.signal,
      })
      .then(({ data }) => {
        if (data) setAgendaItems(data);
      })
      .catch(() => {
        // Ignore abort / handle in main week load.
      });
    return () => controller.abort();
  }, [api, todayDhaka]);

  useEffect(() => {
    const controller = new AbortController();
    const weekEnd = shiftDhakaDate(weekStart, 6);
    api
      .GET("/api/v1/doctor/appointments/", {
        params: { query: { from: weekStart, to: weekEnd } },
        signal: controller.signal,
      })
      .then(({ data }) => {
        if (data) {
          setWeekItems(data);
          setStatus("ready");
        } else {
          setStatus("error");
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setStatus("error");
      });
    return () => controller.abort();
  }, [api, weekStart]);

  const weekDays = Array.from({ length: 7 }, (_, i) => shiftDhakaDate(weekStart, i));

  // Group 14-day agenda by Dhaka date string.
  const agendaGroups: { date: string; rows: CalendarItem[] }[] = [];
  for (const row of agendaItems) {
    const key = dhakaDateValue(row.start_at);
    const last = agendaGroups[agendaGroups.length - 1];
    if (last && last.date === key) {
      last.rows.push(row);
    } else {
      agendaGroups.push({ date: key, rows: [row] });
    }
  }

  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Heading title={t("doctor.calendar.title")} />
        <div className="hidden items-center gap-2 desktop:flex">
          <button
            type="button"
            onClick={() => setWeekStart(shiftDhakaDate(weekStart, -7))}
            className="min-h-10 rounded-control border border-line-strong bg-surface px-3 text-sm font-semibold"
          >
            {t("doctor.calendar.prevWeek")}
          </button>
          <button
            type="button"
            onClick={() => setWeekStart(weekStartMonday(todayDhaka))}
            className="min-h-10 rounded-control border border-line-strong bg-surface px-3 text-sm font-semibold"
          >
            {t("doctor.calendar.today")}
          </button>
          <button
            type="button"
            onClick={() => setWeekStart(shiftDhakaDate(weekStart, 7))}
            className="min-h-10 rounded-control border border-line-strong bg-surface px-3 text-sm font-semibold"
          >
            {t("doctor.calendar.nextWeek")}
          </button>
        </div>
      </div>

      {status === "error" && <FormAlert>{t("doctor.error.generic")}</FormAlert>}

      {/* Phone: 14-day agenda list */}
      <div className="flex flex-col gap-4 desktop:hidden">
        <h2 className="text-sm font-semibold text-ink-muted">
          {t("doctor.calendar.agendaHeading")}
        </h2>
        {agendaGroups.length === 0 ? (
          <p className="rounded-panel border border-line bg-surface p-4 text-sm text-ink-muted">
            {t("doctor.calendar.empty")}
          </p>
        ) : (
          agendaGroups.map((group) => (
            <div key={group.date} className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold text-ink">
                {formatDateTime(locale, `${group.date}T12:00:00+06:00`, {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                })}
              </h3>
              <ul className="flex flex-col gap-2">
                {group.rows.map((item) => (
                  <li key={item.id}>
                    <Link
                      href={`/doctor/cases/${item.consultation_id}`}
                      className={`flex items-center justify-between gap-3 rounded-control border border-line bg-surface p-3 ${itemBorder(item.status)}`}
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-ink">
                          {formatTime(locale, item.start_at)} – {formatTime(locale, item.end_at)}
                        </p>
                        <p className="truncate text-sm text-ink-soft">
                          {item.patient_name} · {item.consultation_code}
                        </p>
                      </div>
                      <span className="shrink-0 text-xs font-semibold text-ink-muted">
                        {t(`doctor.call.status.${item.status}`)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </div>

      {/* Desktop: dense 7-day x 08:00-22:00 week grid */}
      <div className="hidden overflow-x-auto rounded-panel border border-line bg-surface desktop:block">
        <div className="grid min-w-[780px] grid-cols-[64px_repeat(7,minmax(0,1fr))] border-b border-line bg-mist text-xs font-semibold text-ink-muted">
          <div className="p-2" />
          {weekDays.map((day) => {
            const isToday = day === todayDhaka;
            return (
              <div
                key={day}
                className={`border-l border-line p-2 text-center ${isToday ? "text-primary-deep" : ""}`}
              >
                {formatDateTime(locale, `${day}T12:00:00+06:00`, {
                  weekday: "short",
                  day: "numeric",
                  month: "short",
                })}
              </div>
            );
          })}
        </div>

        <div className="grid min-w-[780px] grid-cols-[64px_repeat(7,minmax(0,1fr))]">
          {/* Time rail */}
          <div className="flex flex-col">
            {HOURS.map((hour) => (
              <div
                key={hour}
                style={{ height: HOUR_HEIGHT }}
                className="border-b border-line pr-2 pt-1 text-end font-mono text-xs text-ink-muted last:border-b-0"
              >
                {nf.format(hour)}:00
              </div>
            ))}
          </div>

          {weekDays.map((day) => {
            const dayItems = weekItems.filter((item) => dhakaDateValue(item.start_at) === day);
            return (
              <div
                key={day}
                style={{ height: HOURS.length * HOUR_HEIGHT }}
                className="relative border-l border-line"
              >
                {HOURS.map((hour) => (
                  <div
                    key={hour}
                    style={{ height: HOUR_HEIGHT }}
                    className="border-b border-line/60 last:border-b-0"
                  />
                ))}

                {dayItems.map((item) => {
                  const startMin = minutesSince8am(item.start_at);
                  const topPx = (startMin / 60) * HOUR_HEIGHT;
                  const heightPx = Math.max(28, (item.duration_minutes / 60) * HOUR_HEIGHT);
                  if (topPx >= HOURS.length * HOUR_HEIGHT) return null;
                  return (
                    <Link
                      key={item.id}
                      href={`/doctor/cases/${item.consultation_id}`}
                      style={{ top: topPx, height: heightPx }}
                      title={`${formatTime(locale, item.start_at)} · ${item.patient_name}`}
                      className={`absolute inset-x-1 overflow-hidden rounded-control bg-mist px-1.5 py-1 text-xs leading-tight hover:opacity-90 ${itemBorder(item.status)}`}
                    >
                      <p className="truncate font-semibold text-ink">
                        {formatTime(locale, item.start_at)} · {item.patient_name}
                      </p>
                      <p className="truncate text-[11px] text-ink-muted">{item.consultation_code}</p>
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
