"use client";

import { useCallback, useState } from "react";

import type { components } from "@/api/schema";
import { SearchableTable, type Column } from "@/components/SearchableTable";
import { useListQuery, type ListParams } from "@/hooks/use-list-query";
import { fill } from "@/i18n/catalog";
import type { Locale } from "@/i18n/config";
import type { AdminMessages } from "@/i18n/messages/admin";
import { useMessages } from "@/i18n/provider";

import { useStaffSession } from "../session";

type AuditEntry = components["schemas"]["AuditEntry"];
type ActorType = components["schemas"]["AuditActorTypeEnum"];
type ActorFilter = "all" | ActorType;

const ACTOR_FILTERS: ActorFilter[] = ["all", "staff", "doctor", "patient", "system"];

const ACTION_KEYS: Record<string, keyof AdminMessages> = {
  "staff.create": "admin.audit.action.staff.create",
  "staff.update": "admin.audit.action.staff.update",
  "staff.reset_2fa": "admin.audit.action.staff.reset_2fa",
  "doctor.approve": "admin.audit.action.doctor.approve",
  "doctor.reject": "admin.audit.action.doctor.reject",
  "doctor.suspend": "admin.audit.action.doctor.suspend",
  "doctor.reactivate": "admin.audit.action.doctor.reactivate",
  "doctor.fee.update": "admin.audit.action.doctor.fee.update",
  "consultation.read": "admin.audit.action.consultation.read",
  "consultation.assign": "admin.audit.action.consultation.assign",
  "consultation.patient_record.read": "admin.audit.action.consultation.patient_record.read",
  "consultation.categories.update": "admin.audit.action.consultation.categories.update",
  "question_template.create": "admin.audit.action.question_template.create",
  "question_template.update": "admin.audit.action.question_template.update",
  "prescription.read": "admin.audit.action.prescription.read",
  "patient_photo.read": "admin.audit.action.patient_photo.read",
  "remedy.create": "admin.audit.action.remedy.create",
  "remedy.update": "admin.audit.action.remedy.update",
  "remedy.picture.set": "admin.audit.action.remedy.picture.set",
  "remedy.picture.remove": "admin.audit.action.remedy.picture.remove",
  "remedy.prices.update": "admin.audit.action.remedy.prices.update",
  "illness_category.create": "admin.audit.action.illness_category.create",
  "illness_category.update": "admin.audit.action.illness_category.update",
  "illness.create": "admin.audit.action.illness.create",
  "illness.update": "admin.audit.action.illness.update",
  "illness.remedies.update": "admin.audit.action.illness.remedies.update",
  "shop.create": "admin.audit.action.shop.create",
  "shop.update": "admin.audit.action.shop.update",
  "shop_staff.add": "admin.audit.action.shop_staff.add",
  "shop_staff.remove": "admin.audit.action.shop_staff.remove",
  "shop_remedy.create": "admin.audit.action.shop_remedy.create",
  "shop_remedy.update": "admin.audit.action.shop_remedy.update",
  "shop_remedy.delete": "admin.audit.action.shop_remedy.delete",
  "order.read": "admin.audit.action.order.read",
  "order.assign_line": "admin.audit.action.order.assign_line",
  "order.unassign_line": "admin.audit.action.order.unassign_line",
  "order.assignment.status": "admin.audit.action.order.assignment.status",
  "order.cancel": "admin.audit.action.order.cancel",
  "invoice.waive": "admin.audit.action.invoice.waive",
  "invoice.close": "admin.audit.action.invoice.close",
};

const AUDIT_ACTIONS = Object.keys(ACTION_KEYS);

function formatDateTime(locale: Locale, iso: string): string {
  try {
    return new Intl.DateTimeFormat(locale === "bn" ? "bn-BD" : "en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function formatFieldValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value);
}

function DiffSide({
  title,
  data,
  other,
  emptyLabel,
}: {
  title: string;
  data: Record<string, unknown> | null;
  other: Record<string, unknown> | null;
  emptyLabel: string;
}) {
  const keys = Array.from(new Set([...Object.keys(data ?? {}), ...Object.keys(other ?? {})]));
  return (
    <div className="rounded-control border border-line bg-surface p-3">
      <h3 className="pb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
        {title}
      </h3>
      {!data ? (
        <p className="text-sm text-ink-muted">{emptyLabel}</p>
      ) : (
        <dl className="flex flex-col gap-1.5 text-sm">
          {keys.map((key) => {
            const val = data[key];
            const otherVal = other?.[key];
            const changed = JSON.stringify(val) !== JSON.stringify(otherVal);
            return (
              <div
                key={key}
                className={`flex flex-wrap justify-between gap-2 rounded-control px-2 py-1 ${
                  changed ? "bg-amber-wash" : ""
                }`}
              >
                <dt className="font-mono text-xs text-ink-muted">{key}</dt>
                <dd className="break-all font-mono text-xs text-ink">{formatFieldValue(val)}</dd>
              </div>
            );
          })}
        </dl>
      )}
    </div>
  );
}

/** Chronological audit trail visible to super admins. */
export function AuditLog() {
  const { locale, t } = useMessages<AdminMessages>();
  const { api } = useStaffSession();

  const [actorFilter, setActorFilter] = useState<ActorFilter>("all");
  const [actionFilter, setActionFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchPage = useCallback(
    async ({ q, page, pageSize }: ListParams, signal: AbortSignal) => {
      const { data } = await api.GET("/api/v1/admin/audit/", {
        params: {
          query: {
            actor_type: actorFilter === "all" ? undefined : actorFilter,
            action: actionFilter || undefined,
            from: fromDate || undefined,
            to: toDate || undefined,
            q: q || undefined,
            page,
            page_size: pageSize,
          },
        },
        signal,
      });
      return data ?? null;
    },
    [api, actorFilter, actionFilter, fromDate, toDate],
  );
  const list = useListQuery<AuditEntry>(fetchPage);

  function describeAction(action: string): string {
    const key = ACTION_KEYS[action];
    return key ? t(key) : action;
  }

  const columns: Column<AuditEntry>[] = [
    {
      key: "time",
      header: t("admin.audit.col.time"),
      cell: (row) => (
        <span className="whitespace-nowrap text-xs text-ink-muted">
          {formatDateTime(locale, row.created_at)}
        </span>
      ),
    },
    {
      key: "who",
      header: t("admin.audit.col.who"),
      cell: (row) => (
        <div className="flex flex-col">
          <span className="text-sm font-semibold text-ink">{row.actor_label || "—"}</span>
          <span className="text-xs text-ink-muted">
            {t(`admin.audit.actor.${row.actor_type}`)}
          </span>
        </div>
      ),
    },
    {
      key: "action",
      header: t("admin.audit.col.action"),
      cell: (row) => <span className="text-sm text-ink">{describeAction(row.action)}</span>,
    },
    {
      key: "record",
      header: t("admin.audit.col.record"),
      cell: (row) => (
        <span
          title={`${row.target_type}:${row.target_id}`}
          className="inline-block max-w-40 truncate font-mono text-xs text-ink-soft"
        >
          {row.target_type}:{row.target_id}
        </span>
      ),
    },
    {
      key: "ip",
      header: t("admin.audit.col.ip"),
      cell: (row) => <span className="font-mono text-xs text-ink-muted">{row.ip || "—"}</span>,
    },
    {
      key: "details",
      header: t("admin.audit.col.details"),
      cell: (row) => {
        const isOpen = expandedId === row.id;
        return (
          <button
            type="button"
            onClick={() => setExpandedId(isOpen ? null : row.id)}
            aria-expanded={isOpen}
            className="min-h-10 rounded-control border border-line-strong bg-surface px-3 text-xs font-semibold"
          >
            {t(isOpen ? "admin.audit.hideDetails" : "admin.audit.showDetails")}
          </button>
        );
      },
    },
  ];

  return (
    <section className="flex flex-col gap-5">
      <h1 className="font-display text-[34px] leading-tight font-normal desktop:text-[44px]">
        {t("admin.audit.title")}
      </h1>

      <div className="flex flex-wrap gap-2">
        {ACTOR_FILTERS.map((item) => {
          const active = actorFilter === item;
          return (
            <button
              key={item}
              type="button"
              onClick={() => setActorFilter(item)}
              className={`min-h-10 rounded-control px-3.5 text-sm font-semibold ${
                active
                  ? "bg-primary text-surface"
                  : "border border-line-strong bg-surface text-ink"
              }`}
            >
              {t(`admin.audit.actor.${item}`)}
            </button>
          );
        })}
      </div>

      <div className="grid gap-3 desktop:grid-cols-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-semibold text-ink">{t("admin.audit.actionFilter")}</span>
          <select
            value={actionFilter}
            onChange={(event) => setActionFilter(event.target.value)}
            className="min-h-11 rounded-control border border-line-strong bg-surface px-3 text-sm text-ink"
          >
            <option value="">{t("admin.audit.allActions")}</option>
            {AUDIT_ACTIONS.map((action) => (
              <option key={action} value={action}>
                {describeAction(action)}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-semibold text-ink">{t("admin.audit.fromDate")}</span>
          <input
            type="date"
            value={fromDate}
            onChange={(event) => setFromDate(event.target.value)}
            className="min-h-11 rounded-control border border-line-strong bg-surface px-3 text-sm text-ink"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-semibold text-ink">{t("admin.audit.toDate")}</span>
          <input
            type="date"
            value={toDate}
            onChange={(event) => setToDate(event.target.value)}
            className="min-h-11 rounded-control border border-line-strong bg-surface px-3 text-sm text-ink"
          />
        </label>
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
        renderExpanded={(row) => {
          if (expandedId !== row.id) return null;
          const beforeObj = asRecord(row.before);
          const afterObj = asRecord(row.after);
          if (!beforeObj && !afterObj) {
            return (
              <p className="text-sm text-ink-soft">
                {fill(t("admin.audit.openedRecord"), {
                  record: `${row.target_type} (${row.target_id})`,
                })}
              </p>
            );
          }
          return (
            <div className="grid gap-3 desktop:grid-cols-2">
              <DiffSide
                title={t("admin.audit.before")}
                data={beforeObj}
                other={afterObj}
                emptyLabel={t("admin.audit.emptySide")}
              />
              <DiffSide
                title={t("admin.audit.after")}
                data={afterObj}
                other={beforeObj}
                emptyLabel={t("admin.audit.emptySide")}
              />
            </div>
          );
        }}
      />
    </section>
  );
}
