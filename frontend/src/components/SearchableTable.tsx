"use client";

import { useId, type ReactNode } from "react";

import { Pager } from "@/components/Pager";

import type { ListStatus } from "@/hooks/use-list-query";
import type { CommonMessages } from "@/i18n/messages/common";
import { useMessages } from "@/i18n/provider";

export type Column<T> = {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
};

/**
 * A searchable, paginated list for admin screens. It only displays: the caller owns the
 * query and page (see `useListQuery`). On a phone each row becomes a stacked card; from
 * 900px it is a table.
 */
export function SearchableTable<T>({
  columns,
  rows,
  getRowId,
  query,
  onQueryChange,
  page,
  pageSize,
  total,
  onPageChange,
  onRetry,
  status,
}: {
  columns: Column<T>[];
  rows: T[];
  getRowId: (row: T) => string;
  query: string;
  onQueryChange: (query: string) => void;
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onRetry: () => void;
  status: ListStatus;
}) {
  const { t } = useMessages<CommonMessages>();
  const searchId = useId();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor={searchId} className="text-[15px] font-semibold">
          {t("table.search")}
        </label>
        <input
          id={searchId}
          type="search"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          className="min-h-13 w-full rounded-control border border-line-strong bg-surface px-3.5 text-[17px] desktop:max-w-md"
        />
      </div>

      {/* Always present, so screen readers announce each change of message. */}
      <p role="status" className="text-ink-muted empty:hidden">
        {status === "loading" && t("table.loading")}
        {status === "ready" && rows.length === 0 && t("table.empty")}
      </p>
      {status === "error" && (
        <div role="alert" className="flex flex-wrap items-center gap-3 text-danger">
          <span>{t("table.error")}</span>
          <button
            type="button"
            onClick={onRetry}
            className="min-h-11 rounded-control border border-line-strong bg-surface px-4 font-semibold text-ink"
          >
            {t("table.retry")}
          </button>
        </div>
      )}

      {rows.length > 0 && (
        <table role="table" aria-busy={status === "loading"} className="block w-full desktop:table">
          <thead role="rowgroup" className="sr-only desktop:not-sr-only desktop:table-header-group">
            <tr role="row" className="desktop:table-row">
              {columns.map((column) => (
                <th
                  key={column.key}
                  role="columnheader"
                  scope="col"
                  className="border-b border-line px-3 py-2 text-start text-sm font-semibold text-ink-muted"
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody role="rowgroup" className="block desktop:table-row-group">
            {rows.map((row) => (
              <tr
                key={getRowId(row)}
                role="row"
                className="mb-2 block rounded-panel border border-line bg-surface p-3 desktop:mb-0 desktop:table-row desktop:rounded-none desktop:border-0 desktop:border-b desktop:bg-transparent desktop:p-0"
              >
                {columns.map((column) => (
                  <td
                    key={column.key}
                    role="cell"
                    data-label={column.header}
                    className="flex justify-between gap-4 py-1 before:text-sm before:font-semibold before:text-ink-muted before:content-[attr(data-label)] desktop:table-cell desktop:px-3 desktop:py-3 desktop:before:hidden"
                  >
                    <span>{column.cell(row)}</span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <Pager page={page} pageSize={pageSize} total={total} onPageChange={onPageChange} />
    </div>
  );
}
