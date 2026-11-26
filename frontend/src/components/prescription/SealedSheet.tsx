"use client";

import type { components } from "@/api/schema";
import type { Locale } from "@/i18n/config";
import { formatMoney } from "@/i18n/format";

import type { SealedSheetLabels } from "./types";

type LockedSummary = components["schemas"]["LockedPrescriptionSummary"];
type Invoice = components["schemas"]["ConsultationInvoice"];

function formatDate(locale: Locale, value: string): string {
  try {
    return new Intl.DateTimeFormat(locale === "bn" ? "bn-BD" : "en-US", {
      dateStyle: "medium",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

/**
 * Sealed prescription sheet shown before the consultation invoice is paid or waived.
 * Shows only the doctor, date, number of blank labels, and fee breakdown.
 */
export function SealedSheet({
  summary,
  invoice,
  labels,
  locale,
}: {
  summary: LockedSummary;
  invoice: Invoice;
  labels: SealedSheetLabels;
  locale: Locale;
}) {
  const blankCount = Math.max(1, summary.remedy_count);

  return (
    <article className="rounded-panel border border-ink bg-surface p-[3px]">
      <div className="rounded-[10px] border border-ink px-4 py-5 desktop:px-7 desktop:py-6">
        <header className="flex flex-wrap items-start justify-between gap-3 pb-4">
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="text-xs font-semibold text-primary">HomeoHub</span>
            <h2 className="font-display text-2xl leading-tight font-normal text-ink">
              {summary.doctor_name}
            </h2>
            <p className="text-xs text-ink-muted">{labels.remedyCount(summary.remedy_count)}</p>
          </div>
          <time dateTime={summary.issued_at} className="text-xs font-medium text-ink-soft">
            {formatDate(locale, summary.issued_at)}
          </time>
        </header>

        {/* Blank label lines with seal band across them */}
        <div className="relative border-y border-line">
          <div aria-hidden="true" className="flex flex-col divide-y divide-line">
            {Array.from({ length: blankCount }).map((_, idx) => (
              <div key={idx} className="flex items-center gap-4 py-4">
                <span className="h-7 w-14 shrink-0 rounded-sm bg-line" />
                <div className="flex flex-1 flex-col gap-2">
                  <span className="h-4 w-2/3 rounded-sm bg-line" />
                  <span className="h-3 w-1/2 rounded-sm bg-line" />
                </div>
              </div>
            ))}
          </div>

          <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 border-y border-amber bg-amber-wash px-4 py-3 text-center">
            <p className="text-sm font-semibold text-ink">{labels.sealedNotice}</p>
          </div>
        </div>

        {/* Fee breakdown */}
        <dl className="mt-5 flex flex-col gap-2 text-sm">
          <div className="flex items-center justify-between gap-2 text-ink-soft">
            <dt>{labels.doctorFee}</dt>
            <dd>{formatMoney(locale, invoice.doctor_fee_poisha)}</dd>
          </div>
          <div className="flex items-center justify-between gap-2 text-ink-soft">
            <dt>{labels.platformFee}</dt>
            <dd>{formatMoney(locale, invoice.platform_fee_poisha)}</dd>
          </div>
          <div className="flex items-center justify-between gap-2 border-t border-line pt-2 text-ink">
            <dt className="font-semibold">{labels.total}</dt>
            <dd className="font-display text-2xl font-normal">
              {formatMoney(locale, invoice.total_poisha)}
            </dd>
          </div>
        </dl>
      </div>
    </article>
  );
}
