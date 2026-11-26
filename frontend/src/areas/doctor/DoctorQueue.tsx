"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import type { components } from "@/api/schema";
import { Heading, TextField } from "@/components/form/fields";
import { RemedyVial } from "@/components/RemedyVial";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { fill } from "@/i18n/catalog";
import type { Locale } from "@/i18n/config";
import { numberFormat } from "@/i18n/format";
import type { DoctorMessages } from "@/i18n/messages/doctor";
import { useMessages } from "@/i18n/provider";

import { useDoctorSession } from "./session";

type DoctorCaseSummary = components["schemas"]["DoctorConsultationSummary"];
type CaseStatus = components["schemas"]["ConsultationStatusEnum"];
type Urgency = components["schemas"]["UrgencyEnum"];

type FilterKey =
  | "all"
  | "ASSIGNED"
  | "IN_REVIEW"
  | "AWAITING_PATIENT"
  | "RESPONDED"
  | "PRESCRIBED"
  | "COMPLETED"
  | "CLOSED";

const FILTERS: FilterKey[] = [
  "all",
  "ASSIGNED",
  "IN_REVIEW",
  "AWAITING_PATIENT",
  "RESPONDED",
  "PRESCRIBED",
  "COMPLETED",
  "CLOSED",
];

export const DOCTOR_STATUS_BADGE: Record<CaseStatus, string> = {
  SUBMITTED: "bg-amber-wash text-ink",
  ASSIGNED: "bg-amber-wash text-ink",
  IN_REVIEW: "bg-mist text-ink",
  AWAITING_PATIENT: "bg-amber-wash text-ink",
  RESPONDED: "bg-primary/15 text-primary-deep",
  PRESCRIBED: "bg-primary/15 text-primary-deep",
  COMPLETED: "bg-primary/15 text-primary-deep",
  CLOSED_UNPAID: "bg-mist text-ink-muted",
  CLOSED: "bg-mist text-ink-muted",
  CANCELLED: "bg-mist text-danger",
};

const URGENCY_BADGE: Record<Urgency, string> = {
  ROUTINE: "bg-mist text-ink-soft",
  SOON: "bg-amber-wash text-ink",
  URGENT: "bg-mist text-danger",
};

function formatDate(locale: Locale, iso: string): string {
  try {
    return new Intl.DateTimeFormat(locale === "bn" ? "bn-BD" : "en-US", {
      dateStyle: "medium",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function DoctorQueue() {
  const { locale, t } = useMessages<DoctorMessages>();
  const session = useDoctorSession();
  const { api } = session;

  const [filter, setFilter] = useState<FilterKey>("all");
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query.trim());
  const [cases, setCases] = useState<DoctorCaseSummary[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    api
      .GET("/api/v1/doctor/consultations/", {
        params: {
          query: {
            status: filter === "all" ? undefined : filter,
            q: debouncedQuery || undefined,
          },
        },
        signal: controller.signal,
      })
      .then(({ data }) => {
        if (data) {
          setCases(data);
          setFailed(false);
        } else {
          setFailed(true);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => controller.abort();
  }, [api, filter, debouncedQuery]);

  const name = session.status === "signedIn" ? session.doctor.full_name : "";

  return (
    <div className="flex max-w-4xl flex-col gap-5">
      <Heading
        title={t("doctor.queue.title")}
        note={name ? fill(t("doctor.queue.greeting"), { name }) : undefined}
      />

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((key) => {
          const on = filter === key;
          return (
            <button
              key={key}
              type="button"
              aria-pressed={on}
              onClick={() => setFilter(key)}
              className={`min-h-10 rounded-control px-3.5 text-sm font-semibold ${
                on
                  ? "bg-primary text-surface"
                  : "border border-line-strong bg-surface text-ink-soft hover:bg-mist/60"
              }`}
            >
              {t(`doctor.queue.filter.${key}`)}
            </button>
          );
        })}
      </div>

      <TextField
        label={t("doctor.queue.search")}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        maxLength={100}
      />

      {failed ? (
        <p role="alert" className="text-sm font-medium text-danger">
          {t("doctor.error.generic")}
        </p>
      ) : cases === null ? (
        <p role="status" className="text-ink-muted">
          {t("doctor.loading")}
        </p>
      ) : cases.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-panel border border-line bg-surface px-6 py-10 text-center">
          <RemedyVial name="HomeoHub" size="small" />
          <div className="flex flex-col gap-1">
            <p className="font-display text-xl text-ink">{t("doctor.queue.empty")}</p>
            <p className="text-sm text-ink-muted">{t("doctor.queue.emptyNote")}</p>
          </div>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {cases.map((item) => (
            <li
              key={item.id}
              className="flex flex-wrap items-center justify-between gap-4 rounded-panel border border-line bg-surface p-4"
            >
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-display text-lg text-ink">{item.consultation_code}</span>
                  <span
                    className={`rounded-control px-2.5 py-0.5 text-xs font-semibold ${DOCTOR_STATUS_BADGE[item.status]}`}
                  >
                    {t(`doctor.queue.status.${item.status}`)}
                  </span>
                  {item.urgency !== "ROUTINE" && (
                    <span
                      className={`rounded-control px-2.5 py-0.5 text-xs font-semibold ${URGENCY_BADGE[item.urgency]}`}
                    >
                      {t(`doctor.queue.urgency.${item.urgency}`)}
                    </span>
                  )}
                </div>
                <p className="font-semibold text-ink">{item.chief_complaint}</p>
                <p className="text-xs text-ink-soft">
                  {item.patient_name} (
                  {fill(t("doctor.queue.ageValue"), {
                    age: numberFormat(locale).format(item.patient_age),
                  })}
                  ) · {item.patient_area} · {formatDate(locale, item.submitted_at)}
                </p>
              </div>
              <Link
                href={`/doctor/cases/${item.id}`}
                className="inline-flex min-h-11 items-center rounded-control bg-primary px-4 text-sm font-bold text-surface"
              >
                {t("doctor.queue.open")}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
