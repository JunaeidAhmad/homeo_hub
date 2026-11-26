"use client";

import { useCallback, useId, useState } from "react";

import { SearchableTable, type Column } from "@/components/SearchableTable";
import { useListQuery, type ListParams } from "@/hooks/use-list-query";
import { fill } from "@/i18n/catalog";
import { formatMoney } from "@/i18n/format";
import type { AdminMessages } from "@/i18n/messages/admin";
import { useMessages } from "@/i18n/provider";

import { useStaffSession } from "../session";
import { RemedyEditor, STATUSES, type Remedy, type RemedyStatus } from "./RemedyEditor";

const STATUS_CLASS: Record<RemedyStatus, string> = {
  DRAFT: "font-semibold text-amber",
  ACTIVE: "text-primary",
  ARCHIVED: "text-ink-muted",
};

/** All remedies, with the editor. */
export function RemedyDirectory() {
  const { locale, t } = useMessages<AdminMessages>();
  const { api } = useStaffSession();
  const [status, setStatus] = useState<RemedyStatus | "">("");
  const [editing, setEditing] = useState<{ remedy?: Remedy } | null>(null);
  const [notice, setNotice] = useState("");
  const statusId = useId();

  const fetchPage = useCallback(
    async ({ q, page, pageSize }: ListParams, signal: AbortSignal) => {
      const { data } = await api.GET("/api/v1/admin/remedies/", {
        params: {
          query: { q: q || undefined, page, page_size: pageSize, status: status || undefined },
        },
        signal,
      });
      return data ?? null;
    },
    [api, status],
  );
  const list = useListQuery<Remedy>(fetchPage);

  const open = (remedy?: Remedy) => {
    setNotice("");
    setEditing({ remedy });
  };

  const columns: Column<Remedy>[] = [
    {
      key: "name",
      header: t("admin.remedy.name"),
      cell: (row) => (
        <span lang="la" className="font-display text-lg italic">
          {row.name}
        </span>
      ),
    },
    { key: "bangla", header: t("admin.remedy.nameBn"), cell: (row) => row.name_bn || "—" },
    {
      key: "prices",
      header: t("admin.remedy.prices"),
      cell: (row) => {
        const pill = row.prices.find((p) => p.form === "PILL" && p.is_active);
        const liquid = row.prices.find((p) => p.form === "LIQUID" && p.is_active);
        if (!pill && !liquid) return <span className="text-ink-muted">—</span>;
        return (
          <span className="font-display">
            {pill ? formatMoney(locale, pill.price_poisha) : "—"} ·{" "}
            {liquid ? formatMoney(locale, liquid.price_poisha) : "—"}
          </span>
        );
      },
    },
    {
      key: "status",
      header: t("admin.remedy.status"),
      cell: (row) => {
        const current = row.status ?? "DRAFT";
        return (
          <span className={STATUS_CLASS[current]}>{t(`admin.remedy.status.${current}`)}</span>
        );
      },
    },
    {
      key: "actions",
      header: t("admin.staff.actions"),
      cell: (row) => (
        <button
          type="button"
          onClick={() => open(row)}
          aria-label={fill(t("admin.staff.editLabel"), { name: row.name })}
          className="min-h-11 rounded-control border border-line-strong bg-surface px-4 font-semibold"
        >
          {t("admin.staff.edit")}
        </button>
      ),
    },
  ];

  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-[34px] leading-tight font-normal desktop:text-[44px]">
          {t("admin.remedies.title")}
        </h1>
        {!editing && (
          <button
            type="button"
            onClick={() => open()}
            className="min-h-13 rounded-control bg-primary px-5 font-bold text-surface"
          >
            {t("admin.remedy.add")}
          </button>
        )}
      </div>

      <p role="status" className="rounded-control bg-mist px-3.5 py-3 font-medium empty:hidden">
        {notice}
      </p>

      {editing ? (
        <RemedyEditor
          key={editing.remedy?.id ?? "new"}
          remedy={editing.remedy}
          onClose={() => {
            setEditing(null);
            setNotice("");
          }}
          onPictureChanged={(remedy) => {
            setEditing({ remedy });
            list.retry();
          }}
          onPricesSaved={(remedy) => {
            setNotice(fill(t("admin.remedy.pricesSaved"), { name: remedy.name }));
            setEditing({ remedy });
            list.retry();
          }}
          onSaved={(saved) => {
            const message = editing.remedy ? "admin.remedy.saved" : "admin.remedy.created";
            setNotice(fill(t(message), { name: saved.name }));
            setEditing({ remedy: saved }); // stay, so a picture can be added
            list.retry();
          }}
        />
      ) : (
        <>
          <div className="flex flex-col gap-1.5 desktop:max-w-60">
            <label htmlFor={statusId} className="text-[15px] font-semibold">
              {t("admin.remedy.status")}
            </label>
            <select
              id={statusId}
              value={status}
              onChange={(event) => {
                setStatus(event.target.value as RemedyStatus | "");
                list.setPage(1);
              }}
              className="min-h-13 rounded-control border border-line-strong bg-surface px-3 text-[17px]"
            >
              <option value="">{t("admin.remedy.status.all")}</option>
              {STATUSES.map((value) => (
                <option key={value} value={value}>
                  {t(`admin.remedy.status.${value}`)}
                </option>
              ))}
            </select>
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
        </>
      )}
    </section>
  );
}
