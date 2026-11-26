"use client";

import { useCallback, useEffect, useId, useState } from "react";

import { SearchableTable, type Column } from "@/components/SearchableTable";
import { useListQuery, type ListParams } from "@/hooks/use-list-query";
import { fill } from "@/i18n/catalog";
import type { AdminMessages } from "@/i18n/messages/admin";
import { useMessages } from "@/i18n/provider";

import { useStaffSession } from "../session";
import { CategoryEditor, type IllnessCategory } from "./CategoryEditor";
import { IllnessEditor, type Illness, type IllnessStatus } from "./IllnessEditor";

type Tab = "illnesses" | "categories";

const STATUS_CLASS: Record<IllnessStatus, string> = {
  ACTIVE: "text-primary",
  INACTIVE: "text-ink-muted",
};

export function IllnessDirectory() {
  const { t } = useMessages<AdminMessages>();
  const { api } = useStaffSession();

  const [tab, setTab] = useState<Tab>("illnesses");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [categories, setCategories] = useState<IllnessCategory[]>([]);
  const [editingIllness, setEditingIllness] = useState<{ illness?: Illness } | null>(null);
  const [editingCategory, setEditingCategory] = useState<{ category?: IllnessCategory } | null>(
    null,
  );
  const [notice, setNotice] = useState("");
  const filterId = useId();

  const [catReload, setCatReload] = useState(0);

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
      .catch(() => {});
    return () => controller.abort();
  }, [api, catReload]);

  const fetchIllnesses = useCallback(
    async ({ q, page, pageSize }: ListParams, signal: AbortSignal) => {
      const { data } = await api.GET("/api/v1/admin/illnesses/", {
        params: {
          query: {
            q: q || undefined,
            page,
            page_size: pageSize,
            category: categoryFilter || undefined,
          },
        },
        signal,
      });
      return data ?? null;
    },
    [api, categoryFilter],
  );
  const illnessList = useListQuery<Illness>(fetchIllnesses);

  const fetchCategories = useCallback(
    async ({ q, page, pageSize }: ListParams, signal: AbortSignal) => {
      const { data } = await api.GET("/api/v1/admin/illness-categories/", {
        params: {
          query: { q: q || undefined, page, page_size: pageSize },
        },
        signal,
      });
      return data ?? null;
    },
    [api],
  );
  const categoryList = useListQuery<IllnessCategory>(fetchCategories);

  const illnessColumns: Column<Illness>[] = [
    {
      key: "name",
      header: t("admin.category.nameEn"),
      cell: (row) => <span className="font-semibold">{row.name_en}</span>,
    },
    { key: "bangla", header: t("admin.category.nameBn"), cell: (row) => row.name_bn || "—" },
    {
      key: "category",
      header: t("admin.illness.category"),
      cell: (row) => row.category_name_en,
    },
    {
      key: "status",
      header: t("admin.remedy.status"),
      cell: (row) => {
        const current = row.status ?? "INACTIVE";
        return (
          <span className={STATUS_CLASS[current]}>{t(`admin.illness.status.${current}`)}</span>
        );
      },
    },
    {
      key: "actions",
      header: t("admin.staff.actions"),
      cell: (row) => (
        <button
          type="button"
          onClick={() => {
            setNotice("");
            setEditingIllness({ illness: row });
          }}
          aria-label={fill(t("admin.staff.editLabel"), { name: row.name_en })}
          className="min-h-11 rounded-control border border-line-strong bg-surface px-4 font-semibold"
        >
          {t("admin.staff.edit")}
        </button>
      ),
    },
  ];

  const categoryColumns: Column<IllnessCategory>[] = [
    {
      key: "name",
      header: t("admin.category.nameEn"),
      cell: (row) => <span className="font-semibold">{row.name_en}</span>,
    },
    { key: "bangla", header: t("admin.category.nameBn"), cell: (row) => row.name_bn || "—" },
    {
      key: "order",
      header: t("admin.category.sortOrder"),
      cell: (row) => row.sort_order ?? 0,
    },
    {
      key: "active",
      header: t("admin.staff.status"),
      cell: (row) =>
        row.is_active ? (
          <span className="text-primary">{t("admin.staff.active")}</span>
        ) : (
          <span className="text-ink-muted">{t("admin.staff.inactive")}</span>
        ),
    },
    {
      key: "actions",
      header: t("admin.staff.actions"),
      cell: (row) => (
        <button
          type="button"
          onClick={() => {
            setNotice("");
            setEditingCategory({ category: row });
          }}
          aria-label={fill(t("admin.staff.editLabel"), { name: row.name_en })}
          className="min-h-11 rounded-control border border-line-strong bg-surface px-4 font-semibold"
        >
          {t("admin.staff.edit")}
        </button>
      ),
    },
  ];

  const editing = editingIllness !== null || editingCategory !== null;

  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-[34px] leading-tight font-normal desktop:text-[44px]">
          {t("admin.illnesses.title")}
        </h1>
        {!editing && (
          <button
            type="button"
            onClick={() => {
              setNotice("");
              if (tab === "illnesses") {
                setEditingIllness({});
              } else {
                setEditingCategory({});
              }
            }}
            className="min-h-13 rounded-control bg-primary px-5 font-bold text-surface"
          >
            {t(tab === "illnesses" ? "admin.illness.add" : "admin.category.add")}
          </button>
        )}
      </div>

      {!editing && (
        <div className="inline-flex self-start overflow-hidden rounded-control border border-line-strong bg-surface">
          {(["illnesses", "categories"] as const).map((item) => (
            <button
              key={item}
              type="button"
              aria-pressed={tab === item}
              onClick={() => {
                setTab(item);
                setNotice("");
              }}
              className={`min-h-11 px-5 text-[15px] font-semibold not-first:border-l not-first:border-line-strong ${
                tab === item ? "bg-ink text-surface" : "text-ink hover:bg-mist"
              }`}
            >
              {t(`admin.illness.tab.${item}`)}
            </button>
          ))}
        </div>
      )}

      <p role="status" className="rounded-control bg-mist px-3.5 py-3 font-medium empty:hidden">
        {notice}
      </p>

      {editingIllness ? (
        <IllnessEditor
          key={editingIllness.illness?.id ?? "new-illness"}
          illness={editingIllness.illness}
          categories={categories}
          onClose={() => {
            setEditingIllness(null);
            setNotice("");
          }}
          onSaved={(saved) => {
            const msg = editingIllness.illness ? "admin.illness.saved" : "admin.illness.created";
            setNotice(fill(t(msg), { name: saved.name_en }));
            setEditingIllness({ illness: saved });
            illnessList.retry();
          }}
        />
      ) : editingCategory ? (
        <CategoryEditor
          key={editingCategory.category?.id ?? "new-category"}
          category={editingCategory.category}
          onClose={() => {
            setEditingCategory(null);
            setNotice("");
          }}
          onSaved={(saved) => {
            const msg = editingCategory.category
              ? "admin.category.saved"
              : "admin.category.created";
            setNotice(fill(t(msg), { name: saved.name_en }));
            setEditingCategory(null);
            categoryList.retry();
            setCatReload((n) => n + 1);
          }}
        />
      ) : tab === "illnesses" ? (
        <>
          <div className="flex flex-col gap-1.5 desktop:max-w-72">
            <label htmlFor={filterId} className="text-[15px] font-semibold">
              {t("admin.illness.category")}
            </label>
            <select
              id={filterId}
              value={categoryFilter}
              onChange={(event) => {
                setCategoryFilter(event.target.value);
                illnessList.setPage(1);
              }}
              className="min-h-13 rounded-control border border-line-strong bg-surface px-3 text-[17px]"
            >
              <option value="">{t("admin.remedy.status.all")}</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name_en}
                </option>
              ))}
            </select>
          </div>
          <SearchableTable
            columns={illnessColumns}
            rows={illnessList.rows}
            getRowId={(row) => row.id}
            query={illnessList.query}
            onQueryChange={illnessList.setQuery}
            page={illnessList.page}
            pageSize={illnessList.pageSize}
            total={illnessList.total}
            onPageChange={illnessList.setPage}
            onRetry={illnessList.retry}
            status={illnessList.status}
          />
        </>
      ) : (
        <SearchableTable
          columns={categoryColumns}
          rows={categoryList.rows}
          getRowId={(row) => row.id}
          query={categoryList.query}
          onQueryChange={categoryList.setQuery}
          page={categoryList.page}
          pageSize={categoryList.pageSize}
          total={categoryList.total}
          onPageChange={categoryList.setPage}
          onRetry={categoryList.retry}
          status={categoryList.status}
        />
      )}
    </section>
  );
}
