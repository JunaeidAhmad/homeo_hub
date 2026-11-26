"use client";

import Link from "next/link";
import { useCallback, useState } from "react";

import type { components } from "@/api/schema";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { SearchableTable, type Column } from "@/components/SearchableTable";
import { TextField } from "@/components/form/fields";
import { useListQuery, type ListParams } from "@/hooks/use-list-query";
import { fill } from "@/i18n/catalog";
import type { Locale } from "@/i18n/config";
import { formatMoney, numberFormat } from "@/i18n/format";
import type { AdminMessages } from "@/i18n/messages/admin";
import { useMessages } from "@/i18n/provider";

import { useStaffSession } from "../session";
import { useAdminSubmit } from "../use-admin-submit";

type AdminInvoice = components["schemas"]["AdminInvoice"];
type InvoiceStatus = components["schemas"]["InvoiceStatusEnum"];

type ChipKey = "UNPAID" | "OVERDUE" | "PAID" | "WAIVED" | "VOID" | "CLOSED" | "all";

const CHIPS: { key: ChipKey; status?: InvoiceStatus; olderThanDays?: number }[] = [
  { key: "UNPAID", status: "UNPAID" },
  { key: "OVERDUE", status: "UNPAID", olderThanDays: 30 },
  { key: "PAID", status: "PAID" },
  { key: "WAIVED", status: "WAIVED" },
  { key: "VOID", status: "VOID" },
  { key: "CLOSED", status: "CLOSED" },
  { key: "all" },
];

const STATUS_BADGE: Record<InvoiceStatus, string> = {
  UNPAID: "bg-amber-wash text-ink",
  PAID: "bg-primary/15 text-primary-deep",
  WAIVED: "bg-primary/15 text-primary-deep",
  VOID: "bg-mist text-ink-muted",
  CLOSED: "bg-mist text-ink-muted",
};

function formatDate(locale: Locale, iso: string): string {
  try {
    return new Intl.DateTimeFormat(locale === "bn" ? "bn-BD" : "en-US", {
      dateStyle: "medium",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function InvoiceDirectory() {
  const { locale, t } = useMessages<AdminMessages>();
  const session = useStaffSession();
  const { api } = session;
  const { pending, problems, submit, setProblems } = useAdminSubmit();
  const nf = numberFormat(locale);

  const canManage =
    session.status === "signedIn" && session.staff.permissions.includes("manage_payments");

  const [selected, setSelected] = useState<ChipKey>("UNPAID");
  const [notice, setNotice] = useState("");
  const [dialog, setDialog] = useState<{
    kind: "waive" | "close";
    invoice: AdminInvoice;
  } | null>(null);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | undefined>(undefined);

  const activeChip = CHIPS.find((chip) => chip.key === selected) ?? CHIPS[0];

  const fetchPage = useCallback(
    async ({ q, page, pageSize }: ListParams, signal: AbortSignal) => {
      const { data } = await api.GET("/api/v1/admin/invoices/", {
        params: {
          query: {
            q: q || undefined,
            page,
            page_size: pageSize,
            status: activeChip.status,
            older_than_days: activeChip.olderThanDays,
          },
        },
        signal,
      });
      return data ?? null;
    },
    [api, activeChip],
  );
  const list = useListQuery<AdminInvoice>(fetchPage);

  function openAction(kind: "waive" | "close", invoice: AdminInvoice) {
    setProblems({ fields: {} });
    setReason("");
    setReasonError(undefined);
    setDialog({ kind, invoice });
  }

  function confirmAction() {
    if (!dialog) return;
    const clean = reason.trim();
    if (!clean) {
      setReasonError(t("admin.invoices.reasonRequired"));
      return;
    }
    const { kind, invoice } = dialog;
    void submit(
      () =>
        kind === "waive"
          ? api.POST("/api/v1/admin/invoices/{id}/waive/", {
              params: { path: { id: invoice.id } },
              body: { reason: clean },
            })
          : api.POST("/api/v1/admin/invoices/{id}/close/", {
              params: { path: { id: invoice.id } },
              body: { reason: clean },
            }),
      () => {
        setDialog(null);
        setReason("");
        setNotice(
          kind === "waive" ? t("admin.invoices.waivedNotice") : t("admin.invoices.closedNotice"),
        );
        list.retry();
      },
    );
  }

  const columns: Column<AdminInvoice>[] = [
    {
      key: "code",
      header: t("admin.cases.code"),
      cell: (row) => (
        <div className="flex flex-col gap-1">
          <Link
            href={`/admin/cases/${row.consultation_id}`}
            className="font-display text-lg text-primary underline"
          >
            {row.consultation_code}
          </Link>
          {row.status === "UNPAID" && row.days_unpaid !== null && row.days_unpaid > 30 && (
            <span className="self-start rounded-control bg-amber-wash px-2 py-0.5 text-xs font-semibold text-amber">
              {fill(t("admin.invoices.unpaidDays"), {
                days: nf.format(row.days_unpaid),
              })}
            </span>
          )}
        </div>
      ),
    },
    {
      key: "patient",
      header: t("admin.cases.patient"),
      cell: (row) => (
        <div className="flex flex-col">
          <span className="font-semibold text-ink">{row.patient_name}</span>
          <span className="text-xs text-ink-muted">{row.patient_phone}</span>
        </div>
      ),
    },
    {
      key: "doctor",
      header: t("admin.cases.doctor"),
      cell: (row) => <span className="text-sm text-ink-soft">{row.doctor_name ?? "—"}</span>,
    },
    {
      key: "total",
      header: t("admin.payments.amount"),
      cell: (row) => (
        <span className="font-display">{formatMoney(locale, row.total_poisha)}</span>
      ),
    },
    {
      key: "status",
      header: t("admin.staff.status"),
      cell: (row) => {
        const current = row.status ?? "UNPAID";
        return (
          <span
            className={`rounded-control px-2.5 py-0.5 text-xs font-semibold ${STATUS_BADGE[current]}`}
          >
            {t(`admin.invoices.status.${current}`)}
          </span>
        );
      },
    },
    {
      key: "created",
      header: t("admin.payments.created"),
      cell: (row) => (
        <span className="text-sm text-ink-soft">{formatDate(locale, row.created_at)}</span>
      ),
    },
    ...(canManage
      ? [
          {
            key: "actions",
            header: t("admin.staff.actions"),
            cell: (row: AdminInvoice) =>
              row.status === "UNPAID" ? (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => openAction("waive", row)}
                    className="min-h-10 rounded-control border border-line-strong bg-surface px-3 text-xs font-semibold text-primary"
                  >
                    {t("admin.invoices.waive")}
                  </button>
                  <button
                    type="button"
                    onClick={() => openAction("close", row)}
                    className="min-h-10 rounded-control border border-line-strong bg-surface px-3 text-xs font-semibold text-danger"
                  >
                    {t("admin.invoices.close")}
                  </button>
                </div>
              ) : (
                <span className="text-xs text-ink-muted">—</span>
              ),
          } satisfies Column<AdminInvoice>,
        ]
      : []),
  ];

  return (
    <div className="flex flex-col gap-4">
      <p role="status" className="text-sm font-semibold text-primary-deep empty:hidden">
        {notice}
      </p>

      <div className="flex flex-wrap gap-2">
        {CHIPS.map((chip) => {
          const on = chip.key === selected;
          return (
            <button
              key={chip.key}
              type="button"
              aria-pressed={on}
              onClick={() => {
                setSelected(chip.key);
                list.setPage(1);
              }}
              className={`min-h-10 rounded-control px-3.5 text-sm font-semibold ${
                on
                  ? "bg-primary text-surface"
                  : "border border-line-strong bg-surface text-ink-soft hover:bg-mist/60"
              }`}
            >
              {t(`admin.invoices.filter.${chip.key}`)}
            </button>
          );
        })}
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

      <ConfirmDialog
        open={dialog !== null}
        title={
          dialog?.kind === "waive"
            ? t("admin.invoices.waiveTitle")
            : t("admin.invoices.closeTitle")
        }
        body={
          dialog?.kind === "waive"
            ? t("admin.invoices.waiveBody")
            : t("admin.invoices.closeBody")
        }
        confirmLabel={
          dialog?.kind === "waive"
            ? t("admin.invoices.confirmWaive")
            : t("admin.invoices.confirmClose")
        }
        cancelLabel={t("admin.invoices.cancel")}
        tone={dialog?.kind === "close" ? "danger" : "primary"}
        pending={pending}
        error={problems.form}
        onConfirm={confirmAction}
        onClose={() => setDialog(null)}
      >
        <TextField
          label={t("admin.invoices.reasonLabel")}
          value={reason}
          onChange={(event) => {
            setReason(event.target.value);
            setReasonError(undefined);
          }}
          error={reasonError ?? problems.fields.reason}
          maxLength={300}
        />
      </ConfirmDialog>
    </div>
  );
}
