"use client";

import { useCallback, useState } from "react";

import { SearchableTable, type Column } from "@/components/SearchableTable";
import { useListQuery, type ListParams } from "@/hooks/use-list-query";
import { fill } from "@/i18n/catalog";
import type { AdminMessages } from "@/i18n/messages/admin";
import { useMessages } from "@/i18n/provider";

import { RoleLabel } from "../RoleLabel";
import { useStaffSession } from "../session";
import { StaffForm, type StaffMember } from "./StaffForm";

type Editing = { member?: StaffMember } | null;

/** Everyone who can sign in to the admin, with adding and changing accounts. */
export function StaffDirectory() {
  const { t } = useMessages<AdminMessages>();
  const session = useStaffSession();
  const { api } = session;
  const [editing, setEditing] = useState<Editing>(null);
  const [notice, setNotice] = useState("");

  const fetchPage = useCallback(
    async ({ q, page, pageSize }: ListParams, signal: AbortSignal) => {
      const { data } = await api.GET("/api/v1/admin/staff/", {
        params: { query: { q: q || undefined, page, page_size: pageSize } },
        signal,
      });
      return data ?? null;
    },
    [api],
  );
  const list = useListQuery<StaffMember>(fetchPage);

  const open = (member?: StaffMember) => {
    setNotice("");
    setEditing({ member });
  };

  const columns: Column<StaffMember>[] = [
    { key: "name", header: t("admin.staff.name"), cell: (row) => row.full_name },
    { key: "phone", header: t("admin.phone"), cell: (row) => row.phone },
    {
      key: "roles",
      header: t("admin.staff.roles"),
      cell: (row) => (
        <span className="flex flex-wrap justify-end gap-1 desktop:justify-start">
          {row.roles.map((role) => (
            <RoleLabel key={role} role={role} />
          ))}
        </span>
      ),
    },
    {
      key: "status",
      header: t("admin.staff.status"),
      cell: (row) => (
        <span className={row.is_active ? "text-primary" : "font-semibold text-amber"}>
          {t(row.is_active ? "admin.staff.active" : "admin.staff.inactive")}
        </span>
      ),
    },
    {
      key: "actions",
      header: t("admin.staff.actions"),
      cell: (row) => (
        <div className="flex flex-wrap justify-end gap-2 desktop:justify-start">
          <button
            type="button"
            onClick={() => open(row)}
            aria-label={fill(t("admin.staff.editLabel"), { name: row.full_name })}
            className="min-h-11 rounded-control border border-line-strong bg-surface px-4 font-semibold"
          >
            {t("admin.staff.edit")}
          </button>
        </div>
      ),
    },
  ];

  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-[34px] leading-tight font-normal desktop:text-[44px]">
          {t("admin.staff.title")}
        </h1>
        {!editing && (
          <button
            type="button"
            onClick={() => open()}
            className="min-h-13 rounded-control bg-primary px-5 font-bold text-surface"
          >
            {t("admin.staff.add")}
          </button>
        )}
      </div>

      <p role="status" className="rounded-control bg-mist px-3.5 py-3 font-medium empty:hidden">
        {notice}
      </p>

      {editing ? (
        <StaffForm
          key={editing.member?.id ?? "new"}
          member={editing.member}
          onCancel={() => setEditing(null)}
          onSaved={(saved) => {
            const message = editing.member ? "admin.staff.saved" : "admin.staff.created";
            setNotice(fill(t(message), { name: saved.full_name }));
            setEditing(null);
            list.retry();
          }}
        />
      ) : (
        <SearchableTable
          columns={columns}
          rows={list.rows}
          getRowId={(row) => String(row.id)}
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
