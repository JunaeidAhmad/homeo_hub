"use client";

import Link from "next/link";
import { useCallback, useId, useState } from "react";

import type { components } from "@/api/schema";
import { useApiClient } from "@/api/use-api-client";
import { useSession } from "@/areas/patient/session/SessionProvider";
import { Pager } from "@/components/Pager";
import { FormAlert } from "@/components/form/fields";
import { useListQuery, type ListParams } from "@/hooks/use-list-query";
import { fill } from "@/i18n/catalog";
import type { Locale } from "@/i18n/config";
import { formatMoney, numberFormat } from "@/i18n/format";
import type { CommonMessages } from "@/i18n/messages/common";
import type { PatientMessages } from "@/i18n/messages/patient";
import { useMessages } from "@/i18n/provider";

import { ACTIVE_ORDER_STATUSES, ORDER_STATUS_META } from "./status";

type OrderCard = components["schemas"]["PatientOrderCard"];

const FILTERS: { key: "all" | "active" | "delivered" | "cancelled"; statusParam: string }[] = [
  { key: "all", statusParam: "" },
  { key: "active", statusParam: ACTIVE_ORDER_STATUSES.join(",") },
  { key: "delivered", statusParam: "DELIVERED" },
  { key: "cancelled", statusParam: "CANCELLED,RETURNED" },
];

function formatDate(locale: Locale, iso: string): string {
  try {
    return new Intl.DateTimeFormat(locale === "bn" ? "bn-BD" : "en-US", {
      dateStyle: "medium",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function OrderList() {
  const { locale, t } = useMessages<CommonMessages & PatientMessages>();
  const session = useSession();

  const isGuest =
    session.status === "signedOut" || (session.status === "unavailable" && !session.hasSession);

  if (isGuest) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-panel border border-line bg-surface p-6 text-center">
        <p className="text-base text-ink-soft">{t("patient.orders.guest")}</p>
        <Link
          href="/signin?next=/orders"
          className="flex min-h-13 items-center justify-center rounded-control bg-primary px-6 font-bold text-surface"
        >
          {t("patient.cart.signIn")}
        </Link>
      </div>
    );
  }

  if (session.status !== "signedIn") {
    return (
      <p role="status" className="text-ink-muted">
        {t("table.loading")}
      </p>
    );
  }

  return <SignedInOrderList locale={locale} t={t} />;
}

function SignedInOrderList({
  locale,
  t,
}: {
  locale: Locale;
  t: (key: keyof (CommonMessages & PatientMessages)) => string;
}) {
  const api = useApiClient();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("all");
  const searchId = useId();
  const activeStatusParam = FILTERS.find((item) => item.key === filter)?.statusParam ?? "";

  const fetchPage = useCallback(
    async ({ q, page, pageSize }: ListParams, signal: AbortSignal) => {
      const { data } = await api.GET("/api/v1/orders/", {
        params: {
          query: {
            q: q || undefined,
            page,
            page_size: pageSize,
            status: activeStatusParam || undefined,
          },
        },
        signal,
      });
      return data ?? null;
    },
    [api, activeStatusParam],
  );
  const list = useListQuery<OrderCard>(fetchPage);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor={searchId} className="text-[15px] font-semibold">
          {t("patient.orders.search")}
        </label>
        <input
          id={searchId}
          type="search"
          value={list.query}
          onChange={(event) => list.setQuery(event.target.value)}
          className="min-h-13 w-full rounded-control border border-line-strong bg-surface px-3.5 text-[17px] desktop:max-w-md"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((item) => (
          <button
            key={item.key}
            type="button"
            aria-pressed={filter === item.key}
            onClick={() => {
              setFilter(item.key);
              list.setPage(1);
            }}
            className={`min-h-11 rounded-control border px-4 text-[15px] font-semibold ${
              filter === item.key
                ? "border-ink bg-ink text-surface"
                : "border-line-strong bg-surface text-ink"
            }`}
          >
            {t(`patient.orders.filter.${item.key}`)}
          </button>
        ))}
      </div>

      <p role="status" className="text-ink-muted empty:hidden">
        {list.status === "loading" && t("table.loading")}
      </p>
      {list.status === "error" && (
        <FormAlert>
          <div className="flex flex-wrap items-center gap-3">
            <span>{t("table.error")}</span>
            <button
              type="button"
              onClick={list.retry}
              className="min-h-11 rounded-control border border-line-strong bg-surface px-4 font-semibold"
            >
              {t("table.retry")}
            </button>
          </div>
        </FormAlert>
      )}

      {list.status === "ready" && list.rows.length === 0 && (
        <div className="flex flex-col items-center gap-4 rounded-panel border border-line bg-surface p-6 text-center">
          <p className="text-base text-ink-soft">{t("patient.orders.empty")}</p>
          <Link
            href="/remedies"
            className="flex min-h-13 items-center justify-center rounded-control bg-primary px-6 font-bold text-surface"
          >
            {t("patient.cart.browse")}
          </Link>
        </div>
      )}

      {list.rows.length > 0 && (
        <>
          <ul className="flex flex-col gap-3">
            {list.rows.map((order) => {
              const meta = ORDER_STATUS_META[order.status];
              return (
                <li key={order.id}>
                  <Link
                    href={`/orders/${order.id}`}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-panel border border-line bg-surface p-4 hover:border-line-strong"
                  >
                    <div className="flex flex-col gap-1">
                      <span className="font-display text-xl">{order.code}</span>
                      <span className="text-sm text-ink-muted">
                        {formatDate(locale, order.placed_at)} ·{" "}
                        {fill(t("patient.orders.itemsCount"), {
                          count: numberFormat(locale).format(order.item_count),
                        })}
                      </span>
                    </div>
                    <div className="flex flex-col items-end gap-1.5">
                      <span className="font-display text-xl">
                        {formatMoney(locale, order.total_poisha)}
                      </span>
                      <span
                        className={`rounded-control px-2.5 py-0.5 text-xs font-semibold ${meta.badgeClass}`}
                      >
                        {t(meta.labelKey)}
                      </span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
          <Pager
            page={list.page}
            pageSize={list.pageSize}
            total={list.total}
            onPageChange={list.setPage}
          />
        </>
      )}
    </div>
  );
}
