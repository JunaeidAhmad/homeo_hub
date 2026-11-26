"use client";

import Link from "next/link";
import { useCallback, useState } from "react";

import type { components } from "@/api/schema";
import { Heading } from "@/components/form/fields";
import { SearchableTable, type Column } from "@/components/SearchableTable";
import { useListQuery, type ListParams } from "@/hooks/use-list-query";
import type { Locale } from "@/i18n/config";
import { formatMoney } from "@/i18n/format";
import type { AdminMessages } from "@/i18n/messages/admin";
import { useMessages } from "@/i18n/provider";

import { useStaffSession } from "../session";

type DoctorSummary = components["schemas"]["AdminDoctorSummary"];
type DoctorStatus = components["schemas"]["DoctorStatusEnum"];

type Chip = { key: DoctorStatus | "all"; status?: DoctorStatus };

const CHIPS: Chip[] = [
  { key: "PENDING_APPROVAL", status: "PENDING_APPROVAL" },
  { key: "APPROVED", status: "APPROVED" },
  { key: "REJECTED", status: "REJECTED" },
  { key: "SUSPENDED", status: "SUSPENDED" },
  { key: "all" },
];

const STATUS_BADGE: Record<DoctorStatus, string> = {
  PENDING_APPROVAL: "bg-amber-wash text-ink",
  APPROVED: "bg-primary/15 text-primary-deep",
  REJECTED: "bg-mist text-danger",
  SUSPENDED: "bg-mist text-danger",
};

function formatDate(locale: Locale, iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat(locale === "bn" ? "bn-BD" : "en-US", {
      dateStyle: "medium",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function DoctorDirectory() {
  const { locale, t } = useMessages<AdminMessages>();
  const { api } = useStaffSession();
  const [selected, setSelected] = useState<Chip["key"]>("PENDING_APPROVAL");

  const activeChip = CHIPS.find((chip) => chip.key === selected) ?? CHIPS[0];

  const fetchPage = useCallback(
    async ({ q, page, pageSize }: ListParams, signal: AbortSignal) => {
      const { data } = await api.GET("/api/v1/admin/doctors/", {
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
  const list = useListQuery<DoctorSummary>(fetchPage);

  const columns: Column<DoctorSummary>[] = [
    {
      key: "name",
      header: t("admin.doctors.name"),
      cell: (row) => (
        <div className="flex flex-col gap-0.5">
          <span className="font-semibold text-ink">{row.full_name}</span>
          {row.doctor_code && (
            <span className="font-display text-xs text-primary">{row.doctor_code}</span>
          )}
        </div>
      ),
    },
    {
      key: "reg",
      header: t("admin.doctors.regNo"),
      cell: (row) => <span className="text-sm text-ink-soft">{row.registration_no}</span>,
    },
    { key: "area", header: t("admin.doctors.area"), cell: (row) => row.area },
    {
      key: "fee",
      header: t("admin.doctors.fee"),
      cell: (row) => (
        <span className="font-display">
          {formatMoney(locale, row.consultation_fee_poisha ?? row.requested_fee_poisha)}
        </span>
      ),
    },
    {
      key: "submitted",
      header: t("admin.doctors.submitted"),
      cell: (row) => (
        <span className="text-sm text-ink-soft">{formatDate(locale, row.submitted_at)}</span>
      ),
    },
    {
      key: "status",
      header: t("admin.staff.status"),
      cell: (row) => {
        const status = row.status ?? "PENDING_APPROVAL";
        return (
          <span className={`rounded-control px-2.5 py-0.5 text-xs font-semibold ${STATUS_BADGE[status]}`}>
            {t(`admin.doctors.status.${status}`)}
          </span>
        );
      },
    },
    {
      key: "actions",
      header: t("admin.staff.actions"),
      cell: (row) => (
        <Link
          href={`/admin/doctors/${row.id}`}
          className="inline-flex min-h-11 items-center rounded-control border border-line-strong bg-surface px-4 font-semibold text-primary"
        >
          {t("admin.doctors.open")}
        </Link>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-5">
      <Heading title={t("admin.doctors.title")} />

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
              {t(`admin.doctors.filter.${chip.key}`)}
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
