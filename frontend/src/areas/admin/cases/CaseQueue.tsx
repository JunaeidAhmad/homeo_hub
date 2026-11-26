"use client";

import Link from "next/link";
import { useCallback, useState } from "react";

import type { components } from "@/api/schema";
import { Heading } from "@/components/form/fields";
import { SearchableTable, type Column } from "@/components/SearchableTable";
import { useListQuery, type ListParams } from "@/hooks/use-list-query";
import type { Locale } from "@/i18n/config";
import type { AdminMessages } from "@/i18n/messages/admin";
import { useMessages } from "@/i18n/provider";

import { useStaffSession } from "../session";

type CaseSummary = components["schemas"]["AdminConsultationSummary"];
type CaseStatus = components["schemas"]["ConsultationStatusEnum"];
type Urgency = components["schemas"]["UrgencyEnum"];

type Chip = { key: CaseStatus | "all"; status?: CaseStatus };

const CHIPS: Chip[] = [
  { key: "SUBMITTED", status: "SUBMITTED" },
  { key: "ASSIGNED", status: "ASSIGNED" },
  { key: "IN_REVIEW", status: "IN_REVIEW" },
  { key: "AWAITING_PATIENT", status: "AWAITING_PATIENT" },
  { key: "RESPONDED", status: "RESPONDED" },
  { key: "PRESCRIBED", status: "PRESCRIBED" },
  { key: "CLOSED", status: "CLOSED" },
  { key: "CANCELLED", status: "CANCELLED" },
  { key: "all" },
];

export const CASE_STATUS_BADGE: Record<CaseStatus, string> = {
  SUBMITTED: "bg-amber-wash text-ink",
  ASSIGNED: "bg-mist text-ink",
  IN_REVIEW: "bg-mist text-ink",
  AWAITING_PATIENT: "bg-amber-wash text-ink",
  RESPONDED: "bg-mist text-ink",
  PRESCRIBED: "bg-primary/15 text-primary-deep",
  CLOSED: "bg-primary/15 text-primary-deep",
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

export function CaseQueue() {
  const { locale, t } = useMessages<AdminMessages>();
  const { api } = useStaffSession();
  const [selected, setSelected] = useState<Chip["key"]>("SUBMITTED");

  const activeChip = CHIPS.find((chip) => chip.key === selected) ?? CHIPS[0];

  const fetchPage = useCallback(
    async ({ q, page, pageSize }: ListParams, signal: AbortSignal) => {
      const { data } = await api.GET("/api/v1/admin/doctor-consultations/", {
        params: {
          query: {
            q: q || undefined,
            page,
            page_size: pageSize,
            status: activeChip.status,
          },
        },
        signal,
      });
      return data ?? null;
    },
    [api, activeChip],
  );
  const list = useListQuery<CaseSummary>(fetchPage);

  const columns: Column<CaseSummary>[] = [
    {
      key: "code",
      header: t("admin.cases.code"),
      cell: (row) => (
        <div className="flex flex-col gap-1">
          <span className="font-display text-lg">{row.consultation_code}</span>
          {row.urgency && row.urgency !== "ROUTINE" && (
            <span
              className={`self-start rounded-control px-2 py-0.5 text-xs font-semibold ${URGENCY_BADGE[row.urgency]}`}
            >
              {t(`admin.cases.urgency.${row.urgency}`)}
            </span>
          )}
        </div>
      ),
    },
    {
      key: "patient",
      header: t("admin.cases.patient"),
      cell: (row) => (
        <div className="flex flex-col">
          <span className="font-semibold text-ink">{row.patient_name}</span>
          <span className="text-xs text-ink-muted">{row.area}</span>
        </div>
      ),
    },
    {
      key: "complaint",
      header: t("admin.cases.complaint"),
      cell: (row) => <span className="text-sm text-ink-soft">{row.chief_complaint}</span>,
    },
    {
      key: "doctor",
      header: t("admin.cases.doctor"),
      cell: (row) => (
        <span className="text-sm text-ink-soft">
          {row.doctor_name ?? t("admin.cases.unassigned")}
        </span>
      ),
    },
    {
      key: "submitted",
      header: t("admin.cases.submitted"),
      cell: (row) => (
        <span className="text-sm text-ink-soft">{formatDate(locale, row.submitted_at)}</span>
      ),
    },
    {
      key: "status",
      header: t("admin.staff.status"),
      cell: (row) => {
        const status = row.status ?? "SUBMITTED";
        return (
          <span
            className={`rounded-control px-2.5 py-0.5 text-xs font-semibold ${CASE_STATUS_BADGE[status]}`}
          >
            {t(`admin.cases.status.${status}`)}
          </span>
        );
      },
    },
    {
      key: "actions",
      header: t("admin.staff.actions"),
      cell: (row) => (
        <Link
          href={`/admin/cases/${row.id}`}
          className="inline-flex min-h-11 items-center rounded-control border border-line-strong bg-surface px-4 font-semibold text-primary"
        >
          {t("admin.cases.open")}
        </Link>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-5">
      <Heading title={t("admin.cases.title")} />

      <div className="flex flex-wrap gap-2">
        {CHIPS.map((chip) => {
          const on = chip.key === selected;
          return (
            <button
              key={chip.key}
              type="button"
              aria-pressed={on}
              onClick={() => {
                setSelected(chip.key);
                list.setPage(1);
              }}
              className={`min-h-10 rounded-control px-3.5 text-sm font-semibold ${
                on
                  ? "bg-primary text-surface"
                  : "border border-line-strong bg-surface text-ink-soft hover:bg-mist/60"
              }`}
            >
              {t(`admin.cases.filter.${chip.key}`)}
            </button>
          );
        })}
      </div>

      <SearchableTable
        columns={columns}
        rows={list.rows}
        getRowId={(row) => row.id}
        query={list.query}
        onQueryChange={list.setQuery}
        page={list.page}
        pageSize={list.pageSize}
        total={list.total}
        onPageChange={list.setPage}
        onRetry={list.retry}
        status={list.status}
      />
    </div>
  );
}
