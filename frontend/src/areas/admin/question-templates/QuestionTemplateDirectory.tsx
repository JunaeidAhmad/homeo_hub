"use client";

import { useCallback, useEffect, useState } from "react";

import type { components } from "@/api/schema";
import { SearchableTable, type Column } from "@/components/SearchableTable";
import { useListQuery, type ListParams } from "@/hooks/use-list-query";
import { numberFormat } from "@/i18n/format";
import type { AdminMessages } from "@/i18n/messages/admin";
import { useMessages } from "@/i18n/provider";

import { useStaffSession } from "../session";
import { QuestionTemplateEditor, type AdminQuestionTemplate } from "./QuestionTemplateEditor";

type CategoryOption = components["schemas"]["AdminIllnessCategory"];
type TemplateStatus = components["schemas"]["QuestionTemplateStatusEnum"];
type StatusFilter = "all" | TemplateStatus;

const STATUS_FILTERS: StatusFilter[] = ["ACTIVE", "RETIRED", "all"];

export function QuestionTemplateDirectory() {
  const { locale, t } = useMessages<AdminMessages>();
  const { api } = useStaffSession();
  const nf = numberFormat(locale);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ACTIVE");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [editing, setEditing] = useState<{ template?: AdminQuestionTemplate } | null>(null);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    api
      .GET("/api/v1/admin/illness-categories/", {
        params: { query: { page_size: 100 } },
        signal: controller.signal,
      })
      .then(({ data }) => {
        if (data) setCategories(data.results);
      })
      .catch(() => {
        // Optional filter options; ignore transient errors cleanly.
      });
    return () => controller.abort();
  }, [api]);

  const fetchPage = useCallback(
    async ({ q, page, pageSize }: ListParams, signal: AbortSignal) => {
      const { data } = await api.GET("/api/v1/admin/question-templates/", {
        params: {
          query: {
            status: statusFilter === "all" ? undefined : statusFilter,
            category: categoryFilter || undefined,
            q: q || undefined,
            page,
            page_size: pageSize,
          },
        },
        signal,
      });
      return data ?? null;
    },
    [api, statusFilter, categoryFilter],
  );
  const list = useListQuery<AdminQuestionTemplate>(fetchPage);

  const columns: Column<AdminQuestionTemplate>[] = [
    {
      key: "question",
      header: t("admin.qt.col.question"),
      cell: (row) => (
        <span className="line-clamp-2 text-sm font-medium text-ink">
          {locale === "bn" ? row.text_bn || row.text_en : row.text_en}
        </span>
      ),
    },
    {
      key: "type",
      header: t("admin.qt.col.type"),
      cell: (row) => (
        <span className="text-xs text-ink-soft">{t(`admin.qt.type.${row.question_type}`)}</span>
      ),
    },
    {
      key: "tags",
      header: t("admin.qt.col.tags"),
      cell: (row) =>
        row.categories.length === 0 ? (
          <span className="text-xs text-ink-muted">—</span>
        ) : (
          <span className="flex flex-wrap gap-1">
            {row.categories.map((cat) => (
              <span
                key={cat.id}
                className="rounded-control bg-mist px-2 py-0.5 text-xs font-medium text-ink"
              >
                {cat.name}
              </span>
            ))}
          </span>
        ),
    },
    {
      key: "uses",
      header: t("admin.qt.col.uses"),
      cell: (row) => <span className="text-sm text-ink-soft">{nf.format(row.use_count)}</span>,
    },
    {
      key: "status",
      header: t("admin.qt.col.status"),
      cell: (row) => (
        <span
          className={`rounded-control px-2 py-0.5 text-xs font-semibold ${
            row.status === "ACTIVE" ? "bg-primary/15 text-primary-deep" : "bg-mist text-ink-muted"
          }`}
        >
          {t(`admin.qt.status.${row.status}`)}
        </span>
      ),
    },
    {
      key: "actions",
      header: t("admin.qt.col.actions"),
      cell: (row) => (
        <button
          type="button"
          onClick={() => {
            setNotice("");
            setEditing({ template: row });
          }}
          className="min-h-10 rounded-control border border-line-strong bg-surface px-3.5 text-sm font-semibold"
        >
          {t("admin.qt.edit")}
        </button>
      ),
    },
  ];

  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-[34px] leading-tight font-normal desktop:text-[44px]">
          {t("admin.qt.title")}
        </h1>
        {!editing && (
          <button
            type="button"
            onClick={() => {
              setNotice("");
              setEditing({});
            }}
            className="min-h-13 rounded-control bg-primary px-5 font-bold text-surface"
          >
            {t("admin.qt.add")}
          </button>
        )}
      </div>

      <p role="status" className="rounded-control bg-mist px-3.5 py-3 font-medium empty:hidden">
        {notice}
      </p>

      {editing ? (
        <QuestionTemplateEditor
          key={editing.template?.id ?? "new"}
          template={editing.template}
          categories={categories}
          onCancel={() => setEditing(null)}
          onSaved={(_saved, created) => {
            setNotice(t(created ? "admin.qt.createdNotice" : "admin.qt.savedNotice"));
            setEditing(null);
            list.retry();
          }}
        />
      ) : (
        <>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              {STATUS_FILTERS.map((item) => {
                const active = statusFilter === item;
                return (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setStatusFilter(item)}
                    className={`min-h-10 rounded-control px-3.5 text-sm font-semibold ${
                      active
                        ? "bg-primary text-surface"
                        : "border border-line-strong bg-surface text-ink"
                    }`}
                  >
                    {t(`admin.qt.filter.${item}`)}
                  </button>
                );
              })}
            </div>

            {categories.length > 0 && (
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-semibold text-ink">{t("admin.qt.categoryFilter")}</span>
                <select
                  value={categoryFilter}
                  onChange={(event) => setCategoryFilter(event.target.value)}
                  className="min-h-10 rounded-control border border-line-strong bg-surface px-3 text-sm"
                >
                  <option value="">{t("admin.qt.allCategories")}</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {locale === "bn" ? cat.name_bn || cat.name_en : cat.name_en}
                    </option>
                  ))}
                </select>
              </label>
            )}
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
