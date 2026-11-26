"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useId } from "react";

import type { components } from "@/api/schema";
import { useApiClient } from "@/api/use-api-client";
import { Pager } from "@/components/Pager";
import { RemedyVial } from "@/components/RemedyVial";
import { useListQuery, type ListParams } from "@/hooks/use-list-query";
import { fill } from "@/i18n/catalog";
import { formatMoney } from "@/i18n/format";
import type { CommonMessages } from "@/i18n/messages/common";
import type { PatientMessages } from "@/i18n/messages/patient";
import { useMessages } from "@/i18n/provider";

type Remedy = components["schemas"]["RemedyCard"];

/** Active remedies, searchable by name or complaint, in either language. */
export function RemedyList() {
  const { locale, t } = useMessages<CommonMessages & PatientMessages>();
  const api = useApiClient();
  const searchId = useId();

  const fetchPage = useCallback(
    async ({ q, page, pageSize }: ListParams, signal: AbortSignal) => {
      const { data } = await api.GET("/api/v1/remedies/", {
        params: { query: { q: q || undefined, page, page_size: pageSize } },
        signal,
      });
      return data ?? null;
    },
    [api],
  );
  const list = useListQuery<Remedy>(fetchPage);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor={searchId} className="text-[15px] font-semibold">
          {t("patient.remedies.search")}
        </label>
        <input
          id={searchId}
          type="search"
          value={list.query}
          onChange={(event) => list.setQuery(event.target.value)}
          className="min-h-13 w-full rounded-control border border-line-strong bg-surface px-3.5 text-[17px] desktop:max-w-md"
        />
      </div>

      <p role="status" className="text-ink-muted empty:hidden">
        {list.status === "loading" && t("table.loading")}
        {list.status === "ready" && list.rows.length === 0 && t("table.empty")}
      </p>
      {list.status === "error" && (
        <div role="alert" className="flex flex-wrap items-center gap-3 text-danger">
          <span>{t("table.error")}</span>
          <button
            type="button"
            onClick={list.retry}
            className="min-h-11 rounded-control border border-line-strong bg-surface px-4 font-semibold text-ink"
          >
            {t("table.retry")}
          </button>
        </div>
      )}

      {list.rows.length > 0 && (
        <>
          <ul className="grid gap-2.5 desktop:grid-cols-2">
            {list.rows.map((remedy) => {
              const lowest =
                remedy.prices.length > 0
                  ? Math.min(...remedy.prices.map((entry) => entry.price_poisha))
                  : null;
              return (
                <li key={remedy.id}>
                  <Link
                    href={`/remedies/${remedy.slug}`}
                    className="flex h-full gap-3.5 rounded-panel border border-line bg-surface p-3.5"
                  >
                    <span className="flex h-24 w-18 flex-none items-center justify-center overflow-hidden rounded-control bg-mist">
                      {remedy.picture_url ? (
                        <Image
                          unoptimized
                          src={remedy.picture_url}
                          alt=""
                          width={72}
                          height={96}
                          className="size-full object-contain"
                        />
                      ) : (
                        <RemedyVial name={remedy.name} size="small" />
                      )}
                    </span>
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span lang="la" className="font-display text-xl leading-tight italic">
                        {remedy.name}
                      </span>
                      {remedy.name_bn && (
                        <span lang="bn" className="text-sm text-ink-muted">
                          {remedy.name_bn}
                        </span>
                      )}
                      {lowest !== null && (
                        <span className="font-display text-[15px] font-semibold text-primary-deep">
                          {fill(t("patient.remedy.fromPrice"), {
                            price: formatMoney(locale, lowest),
                          })}
                        </span>
                      )}
                      <span className="line-clamp-3 text-[15px] leading-snug text-ink-soft">
                        {remedy.indication}
                      </span>
                    </span>
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
