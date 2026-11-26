"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { SearchableTable, type Column } from "@/components/SearchableTable";
import { useListQuery, type ListParams } from "@/hooks/use-list-query";
import { fill } from "@/i18n/catalog";
import type { AdminMessages } from "@/i18n/messages/admin";
import { useMessages } from "@/i18n/provider";

import { useStaffSession } from "../session";
import { ShopEditor, type Shop } from "./ShopEditor";

export function ShopDirectory() {
  const { t } = useMessages<AdminMessages>();
  const session = useStaffSession();
  const router = useRouter();
  const [editing, setEditing] = useState<{ shop?: Shop } | null>(null);
  const [notice, setNotice] = useState("");

  const canManageShops =
    session.status === "signedIn" && session.staff.permissions.includes("manage_shops");
  const singleOwnShopId =
    session.status === "signedIn" && !canManageShops && session.staff.shops.length === 1
      ? session.staff.shops[0].id
      : null;

  useEffect(() => {
    if (singleOwnShopId) router.replace(`/admin/shops/${singleOwnShopId}`);
  }, [singleOwnShopId, router]);

  const { api } = session;
  const fetchPage = useCallback(
    async ({ q, page, pageSize }: ListParams, signal: AbortSignal) => {
      const { data } = await api.GET("/api/v1/admin/shops/", {
        params: { query: { q: q || undefined, page, page_size: pageSize } },
        signal,
      });
      return data ?? null;
    },
    [api],
  );
  const list = useListQuery<Shop>(fetchPage);

  if (singleOwnShopId) {
    return (
      <p role="status" className="text-ink-muted">
        {t("admin.loading")}
      </p>
    );
  }

  const columns: Column<Shop>[] = [
    {
      key: "name",
      header: t("admin.shop.name"),
      cell: (row) => <span className="font-semibold">{row.name}</span>,
    },
    {
      key: "area",
      header: t("admin.shop.area"),
      cell: (row) => `${row.location.upazila}, ${row.location.district}`,
    },
    { key: "phone", header: t("admin.shop.phone"), cell: (row) => row.phone },
    {
      key: "verified",
      header: t("admin.shop.verified"),
      cell: (row) =>
        row.is_verified ? (
          <span className="text-primary">{t("admin.shop.verifiedYes")}</span>
        ) : (
          <span className="font-semibold text-amber">{t("admin.shop.verifiedNo")}</span>
        ),
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
        <div className="flex flex-wrap gap-2">
          {canManageShops && (
            <button
              type="button"
              onClick={() => {
                setNotice("");
                setEditing({ shop: row });
              }}
              aria-label={fill(t("admin.staff.editLabel"), { name: row.name })}
              className="min-h-11 rounded-control border border-line-strong bg-surface px-4 font-semibold"
            >
              {t("admin.staff.edit")}
            </button>
          )}
          <Link
            href={`/admin/shops/${row.id}`}
            className="flex min-h-11 items-center rounded-control border border-line-strong bg-surface px-4 font-semibold text-primary"
          >
            {t("admin.shop.priceList")}
          </Link>
        </div>
      ),
    },
  ];

  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-[34px] leading-tight font-normal desktop:text-[44px]">
          {t("admin.shops.title")}
        </h1>
        {!editing && canManageShops && (
          <button
            type="button"
            onClick={() => {
              setNotice("");
              setEditing({});
            }}
            className="min-h-13 rounded-control bg-primary px-5 font-bold text-surface"
          >
            {t("admin.shop.add")}
          </button>
        )}
      </div>

      <p role="status" className="rounded-control bg-mist px-3.5 py-3 font-medium empty:hidden">
        {notice}
      </p>

      {editing ? (
        <ShopEditor
          key={editing.shop?.id ?? "new-shop"}
          shop={editing.shop}
          onClose={() => {
            setEditing(null);
            setNotice("");
          }}
          onSaved={(saved) => {
            const msg = editing.shop ? "admin.shop.saved" : "admin.shop.created";
            setNotice(fill(t(msg), { name: saved.name }));
            setEditing({ shop: saved });
            list.retry();
          }}
        />
      ) : (
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
      )}
    </section>
  );
}
