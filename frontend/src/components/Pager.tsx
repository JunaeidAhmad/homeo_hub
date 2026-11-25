"use client";

import { fill } from "@/i18n/catalog";
import { numberFormat } from "@/i18n/format";
import type { CommonMessages } from "@/i18n/messages/common";
import { useMessages } from "@/i18n/provider";

const BUTTON =
  "min-h-11 rounded-control border border-line-strong bg-surface px-4 font-semibold aria-disabled:opacity-40";

/** Previous / next for a paged list. Unavailable buttons stay focusable. */
export function Pager({
  page,
  pageSize,
  total,
  onPageChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}) {
  const { t, locale } = useMessages<CommonMessages>();
  const number = numberFormat(locale);
  const pages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <nav className="flex items-center justify-between gap-3" aria-label={t("table.pagination")}>
      <button
        type="button"
        aria-disabled={page <= 1}
        onClick={() => !(page <= 1) && onPageChange(page - 1)}
        className={BUTTON}
      >
        {t("table.previous")}
      </button>
      <span aria-live="polite" className="text-center text-sm text-ink-muted">
        <span>{fill(t("table.page"), { page: number.format(page), pages: number.format(pages) })}</span>
        <br />
        <span>{fill(t("table.total"), { count: number.format(total) })}</span>
      </span>
      <button
        type="button"
        aria-disabled={page >= pages}
        onClick={() => !(page >= pages) && onPageChange(page + 1)}
        className={BUTTON}
      >
        {t("table.next")}
      </button>
    </nav>
  );
}
