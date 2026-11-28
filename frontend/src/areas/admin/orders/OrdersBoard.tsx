"use client";

import Link from "next/link";
import { useCallback, useState } from "react";

import type { components } from "@/api/schema";
import { SearchableTable, type Column } from "@/components/SearchableTable";
import { useListQuery, type ListParams } from "@/hooks/use-list-query";
import { fill } from "@/i18n/catalog";
import type { Locale } from "@/i18n/config";
import { formatMoney, numberFormat } from "@/i18n/format";
import type { AdminMessages } from "@/i18n/messages/admin";
import { useMessages } from "@/i18n/provider";

import { useStaffSession } from "../session";

type OrderSummary = components["schemas"]["AdminOrderSummary"];
type OrderStatus = components["schemas"]["OrderStatusEnum"];

type Chip =
  | { key: "unassigned"; unassigned: true; status?: never }
  | { key: "all"; unassigned?: never; status: "" }
  | { key: OrderStatus; unassigned?: never; status: OrderStatus };

const CHIPS: Chip[] = [
  { key: "unassigned", unassigned: true },
  { key: "PENDING_PAYMENT", status: "PENDING_PAYMENT" },
  { key: "all", status: "" },
  { key: "PENDING", status: "PENDING" },
  { key: "CONFIRMED", status: "CONFIRMED" },
  { key: "PROCESSING", status: "PROCESSING" },
  { key: "SHIPPED", status: "SHIPPED" },
  { key: "DELIVERED", status: "DELIVERED" },
  { key: "CANCELLED", status: "CANCELLED" },
  { key: "RETURNED", status: "RETURNED" },
];

const STATUS_BADGE: Record<OrderStatus, string> = {
  PENDING: "bg-amber-wash text-ink",
  PENDING_PAYMENT: "bg-amber-wash text-ink",
  CONFIRMED: "bg-mist text-ink",
  PAID: "bg-mist text-ink",
  PROCESSING: "bg-amber-wash text-ink",
  SHIPPED: "bg-amber-wash text-ink",
  DELIVERED: "bg-primary/15 text-primary-deep",
  CANCELLED: "bg-mist text-danger",
  RETURNED: "bg-mist text-ink-muted",
};

function formatRelative(locale: Locale, iso: string): string {
  const then = new Date(iso).getTime();
  const diffSec = Math.round((then - Date.now()) / 1000);
  const absSec = Math.abs(diffSec);
  const rtf = new Intl.RelativeTimeFormat(locale === "bn" ? "bn-BD" : "en-US", {
    numeric: "auto",
  });
  if (absSec < 60) return rtf.format(diffSec, "second");
  const diffMin = Math.round(diffSec / 60);
  if (Math.abs(diffMin) < 60) return rtf.format(diffMin, "minute");
  const diffHr = Math.round(diffMin / 60);
  if (Math.abs(diffHr) < 24) return rtf.format(diffHr, "hour");
  const diffDays = Math.round(diffHr / 24);
  if (Math.abs(diffDays) < 30) return rtf.format(diffDays, "day");
  return new Intl.DateTimeFormat(locale === "bn" ? "bn-BD" : "en-US", {
    dateStyle: "medium",
  }).format(new Date(iso));
}

export function OrdersBoard() {
  const { locale, t } = useMessages<AdminMessages>();
  const { api } = useStaffSession();
  const [selected, setSelected] = useState<Chip["key"]>("unassigned");

  const activeChip = CHIPS.find((c) => c.key === selected) ?? CHIPS[0];

  const fetchPage = useCallback(
    async ({ q, page, pageSize }: ListParams, signal: AbortSignal) => {
      const { data } = await api.GET("/api/v1/admin/orders/", {
        params: {
          query: {
            q: q || undefined,
            page,
            page_size: pageSize,
            unassigned: activeChip.unassigned ? true : undefined,
            status: activeChip.status || undefined,
          },
        },
        signal,
      });
      return data ?? null;
    },
    [api, activeChip],
  );
  const list = useListQuery<OrderSummary>(fetchPage);

  const columns: Column<OrderSummary>[] = [
    {
      key: "code",
      header: t("admin.orders.code"),
      cell: (row) => (
        <div className="flex flex-col gap-1">
          <span className="font-display text-lg">{row.code}</span>
          {row.unassigned_count > 0 && row.status !== "PENDING_PAYMENT" && (
            <span className="inline-block self-start rounded-control bg-amber-wash px-2 py-0.5 text-xs font-semibold text-amber">
              {fill(t("admin.orders.needsShopCount"), {
                count: numberFormat(locale).format(row.unassigned_count),
              })}
            </span>
          )}
          {row.awaiting_payment_minutes !== null && row.awaiting_payment_minutes > 60 && (
            <span className="inline-block self-start rounded-control bg-amber-wash px-2 py-0.5 text-xs font-semibold text-amber">
              {fill(t("admin.orders.unpaidHours"), {
                hours: numberFormat(locale).format(
                  Math.max(1, Math.floor(row.awaiting_payment_minutes / 60)),
                ),
              })}
            </span>
          )}
        </div>
      ),
    },
    {
      key: "placed",
      header: t("admin.orders.placed"),
      cell: (row) => (
        <span className="text-sm text-ink-soft">{formatRelative(locale, row.placed_at)}</span>
      ),
    },
    {
      key: "patient",
      header: t("admin.orders.patient"),
      cell: (row) => <span className="font-semibold">{row.patient_name}</span>,
    },
    { key: "area", header: t("admin.shop.area"), cell: (row) => row.area },
    {
      key: "total",
      header: t("admin.orders.total"),
      cell: (row) => (
        <span className="font-display">{formatMoney(locale, row.total_poisha)}</span>
      ),
    },
    {
      key: "status",
      header: t("admin.staff.status"),
      cell: (row) => (
        <span
          className={`rounded-control px-2.5 py-0.5 text-xs font-semibold ${STATUS_BADGE[row.status]}`}
        >
          {t(`admin.orders.status.${row.status}`)}
        </span>
      ),
    },
    {
      key: "actions",
      header: t("admin.staff.actions"),
      cell: (row) => (
        <Link
          href={`/admin/orders/${row.id}`}
          className="inline-flex min-h-11 items-center rounded-control border border-line-strong bg-surface px-4 font-semibold text-primary"
        >
          {t("admin.orders.open")}
        </Link>
      ),
    },
  ];

  return (
    <section className="flex flex-col gap-5">
      <h1 className="font-display text-[34px] leading-tight font-normal desktop:text-[44px]">
        {t("admin.orders.title")}
      </h1>

      <div className="flex flex-wrap gap-2">
        {CHIPS.map((chip) => {
          const active = selected === chip.key;
          const isNeedsShop = chip.key === "unassigned";
          return (
            <button
              key={chip.key}
              type="button"
              aria-pressed={active}
              onClick={() => {
                setSelected(chip.key);
                list.setPage(1);
              }}
              className={`min-h-11 rounded-control border px-4 text-[15px] font-semibold ${
                active
                  ? isNeedsShop
                    ? "border-amber bg-amber text-surface"
                    : "border-ink bg-ink text-surface"
                  : isNeedsShop
                    ? "border-amber bg-amber-wash text-ink"
                    : "border-line-strong bg-surface text-ink"
              }`}
            >
              {chip.key === "unassigned"
                ? t("admin.orders.filter.unassigned")
                : chip.key === "all"
                  ? t("admin.orders.filter.all")
                  : t(`admin.orders.status.${chip.key}`)}
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
    </section>
  );
}
