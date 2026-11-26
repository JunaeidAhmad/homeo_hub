"use client";

import Link from "next/link";
import { useCallback, useId, useState } from "react";

import type { components } from "@/api/schema";
import { SearchableTable, type Column } from "@/components/SearchableTable";
import { useListQuery, type ListParams } from "@/hooks/use-list-query";
import type { Locale } from "@/i18n/config";
import { formatMoney } from "@/i18n/format";
import type { AdminMessages } from "@/i18n/messages/admin";
import { useMessages } from "@/i18n/provider";

import { useStaffSession } from "../session";

type AdminPayment = components["schemas"]["AdminPayment"];
type PaymentStatus = components["schemas"]["PaymentStatusEnum"];
type PaymentMethod = components["schemas"]["PaymentMethodEnum"];

const STATUSES: PaymentStatus[] = [
  "INITIATED",
  "PENDING",
  "SUCCESS",
  "FAILED",
  "CANCELLED",
  "EXPIRED",
  "REFUNDED",
];

const STATUS_BADGE: Record<PaymentStatus, string> = {
  INITIATED: "bg-mist text-ink-muted",
  PENDING: "bg-amber-wash text-ink",
  SUCCESS: "bg-primary/15 text-primary-deep",
  FAILED: "bg-mist text-danger",
  CANCELLED: "bg-mist text-ink-muted",
  EXPIRED: "bg-mist text-ink-muted",
  REFUNDED: "bg-mist text-ink-soft",
};

function formatDate(locale: Locale, iso: string): string {
  try {
    return new Intl.DateTimeFormat(locale === "bn" ? "bn-BD" : "en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function PaymentDirectory() {
  const { locale, t } = useMessages<AdminMessages>();
  const { api } = useStaffSession();
  const [status, setStatus] = useState<PaymentStatus | "">("");
  const [method, setMethod] = useState<PaymentMethod | "">("");
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const statusId = useId();
  const methodId = useId();

  const fetchPage = useCallback(
    async ({ q, page, pageSize }: ListParams, signal: AbortSignal) => {
      const { data } = await api.GET("/api/v1/admin/payments/", {
        params: {
          query: {
            q: q || undefined,
            page,
            page_size: pageSize,
            status: status || undefined,
            method: method || undefined,
            is_flagged: flaggedOnly ? true : undefined,
          },
        },
        signal,
      });
      return data ?? null;
    },
    [api, status, method, flaggedOnly],
  );
  const list = useListQuery<AdminPayment>(fetchPage);

  const columns: Column<AdminPayment>[] = [
    {
      key: "tran",
      header: t("admin.payments.tranId"),
      cell: (row) => (
        <div className="flex flex-col gap-1">
          <span className="font-mono text-sm font-semibold">{row.tran_id}</span>
          {row.is_flagged && (
            <span className="inline-block self-start rounded-control bg-amber-wash px-2 py-0.5 text-xs font-semibold text-amber">
              {row.flag_reason || t("admin.payments.flaggedNote")}
            </span>
          )}
        </div>
      ),
    },
    {
      key: "order",
      header: t("admin.orders.code"),
      cell: (row) =>
        row.order_id && row.order_code ? (
          <Link href={`/admin/orders/${row.order_id}`} className="font-display text-primary underline">
            {row.order_code}
          </Link>
        ) : (
          "—"
        ),
    },
    {
      key: "patient",
      header: t("admin.orders.patient"),
      cell: (row) => row.patient_name,
    },
    {
      key: "method",
      header: t("admin.payments.method"),
      cell: (row) => t(row.method === "COD" ? "admin.orders.cod" : "admin.orders.online"),
    },
    {
      key: "amount",
      header: t("admin.payments.amount"),
      cell: (row) => <span className="font-display">{formatMoney(locale, row.amount_poisha)}</span>,
    },
    {
      key: "status",
      header: t("admin.staff.status"),
      cell: (row) => {
        const current = row.status ?? "PENDING";
        return (
          <span className={`rounded-control px-2.5 py-0.5 text-xs font-semibold ${STATUS_BADGE[current]}`}>
            {t(`admin.payments.status.${current}`)}
          </span>
        );
      },
    },
    {
      key: "created",
      header: t("admin.payments.created"),
      cell: (row) => <span className="text-sm text-ink-soft">{formatDate(locale, row.created_at)}</span>,
    },
  ];

  return (
    <section className="flex flex-col gap-5">
      <h1 className="font-display text-[34px] leading-tight font-normal desktop:text-[44px]">
        {t("admin.payments.title")}
      </h1>

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={statusId} className="text-[15px] font-semibold">
            {t("admin.staff.status")}
          </label>
          <select
            id={statusId}
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as PaymentStatus | "");
              list.setPage(1);
            }}
            className="min-h-11 rounded-control border border-line-strong bg-surface px-3 text-base"
          >
            <option value="">{t("admin.orders.filter.all")}</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`admin.payments.status.${s}`)}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={methodId} className="text-[15px] font-semibold">
            {t("admin.payments.method")}
          </label>
          <select
            id={methodId}
            value={method}
            onChange={(event) => {
              setMethod(event.target.value as PaymentMethod | "");
              list.setPage(1);
            }}
            className="min-h-11 rounded-control border border-line-strong bg-surface px-3 text-base"
          >
            <option value="">{t("admin.orders.filter.all")}</option>
            <option value="COD">{t("admin.orders.cod")}</option>
            <option value="ONLINE">{t("admin.orders.online")}</option>
          </select>
        </div>

        <button
          type="button"
          aria-pressed={flaggedOnly}
          onClick={() => {
            setFlaggedOnly((now) => !now);
            list.setPage(1);
          }}
          className={`min-h-11 rounded-control border px-4 text-[15px] font-semibold ${
            flaggedOnly
              ? "border-amber bg-amber text-surface"
              : "border-amber bg-amber-wash text-ink"
          }`}
        >
          {t("admin.payments.flagged")}
        </button>
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
    </section>
  );
}
