"use client";

import type { Locale } from "@/i18n/config";

import type { PrescriptionSheetData, PrescriptionSheetLabels } from "./types";

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
 * Shared dispensary-label prescription sheet used by both the patient view
 * and the doctor's preview/issued view.
 */
export function PrescriptionSheet({
  prescription,
  labels,
  locale,
  unsealing = false,
}: {
  prescription: PrescriptionSheetData;
  labels: PrescriptionSheetLabels;
  locale: Locale;
  unsealing?: boolean;
}) {
  const doItems = prescription.advice.filter((item) => item.kind === "DO");
  const dontItems = prescription.advice.filter((item) => item.kind === "DONT");

  return (
    <article
      className={`rounded-panel border border-ink bg-surface p-[3px] ${
        unsealing ? "animate-[fadeIn_250ms_ease-out]" : ""
      }`}
    >
      <div className="rounded-[10px] border border-ink px-4 py-5 desktop:px-7 desktop:py-6">
        {/* Dispensary header */}
        <header className="flex flex-wrap items-start justify-between gap-3 pb-4">
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="text-xs font-semibold text-primary">HomeoHub</span>
            <h2 className="font-display text-2xl leading-tight font-normal text-ink">
              {prescription.doctor.full_name}
            </h2>
            <p className="text-xs text-ink-muted">
              {labels.regNoPrefix} {prescription.doctor.registration_no}
              {prescription.doctor.doctor_code ? ` · ${prescription.doctor.doctor_code}` : ""}
            </p>
          </div>
          <div className="flex flex-col items-end gap-0.5 text-right">
            <time dateTime={prescription.issued_at} className="text-xs font-medium text-ink-soft">
              {formatDate(locale, prescription.issued_at)}
            </time>
            {prescription.version && labels.versionLabel && (
              <span className="text-xs text-ink-muted">
                {labels.versionLabel(prescription.version)}
              </span>
            )}
          </div>
        </header>

        {/* Remedy lines */}
        <ol className="flex flex-col divide-y divide-line border-y border-line">
          {prescription.items.map((item, idx) => {
            const isLiquid = item.form === "LIQUID";
            const notSold = !item.is_catalog || item.unavailable_reason === "NOT_LISTED";
            const unavailable = item.is_catalog && item.unavailable_reason === "NO_PRICE";

            return (
              <li
                key={item.id ?? `${idx}-${item.remedy_name}`}
                className="flex items-start gap-4 py-4"
              >
                <span className="w-16 shrink-0 pt-0.5 font-display text-[34px] leading-none font-normal text-ink">
                  {item.potency}
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="flex min-w-0 flex-col">
                      {item.is_catalog ? (
                        <span
                          lang="la"
                          className="font-display text-xl leading-snug text-ink italic"
                        >
                          {item.remedy_name}
                        </span>
                      ) : (
                        <span className="text-lg leading-snug font-medium text-ink">
                          {item.remedy_name}
                        </span>
                      )}
                      {item.remedy_name_bn && (
                        <span lang="bn" className="font-display text-sm text-ink-muted">
                          {item.remedy_name_bn}
                        </span>
                      )}
                    </div>

                    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-control border border-line bg-mist/40 px-2 py-0.5 text-xs font-medium text-ink-soft">
                      <span
                        aria-hidden="true"
                        className={`size-3 rounded-[3px] border ${
                          isLiquid
                            ? "border-amber bg-amber-wash"
                            : "border-glass-line bg-glass"
                        }`}
                      />
                      <span>{labels.formLabel[item.form]}</span>
                    </span>
                  </div>

                  <p className="text-sm text-ink-soft">
                    {[item.dosage, item.frequency, item.duration].filter(Boolean).join(", ")}
                  </p>

                  {notSold && (
                    <p className="text-xs font-medium text-ink-muted">{labels.notSoldHere}</p>
                  )}
                  {unavailable && (
                    <p className="text-xs font-medium text-ink-muted">
                      {labels.currentlyUnavailable}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ol>

        {/* Do / Don't advice */}
        {(doItems.length > 0 || dontItems.length > 0) && (
          <div className="grid gap-5 pt-4 desktop:grid-cols-2">
            {doItems.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <h3 className="text-base font-bold text-primary-deep">{labels.doTitle}</h3>
                <ul className="flex list-disc flex-col gap-1 pl-5 text-sm leading-relaxed text-ink-soft">
                  {doItems.map((entry, idx) => (
                    <li key={`${idx}-${entry.text}`}>{entry.text}</li>
                  ))}
                </ul>
              </div>
            )}
            {dontItems.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <h3 className="text-base font-bold text-danger">{labels.dontTitle}</h3>
                <ul className="flex list-disc flex-col gap-1 pl-5 text-sm leading-relaxed text-ink-soft">
                  {dontItems.map((entry, idx) => (
                    <li key={`${idx}-${entry.text}`}>{entry.text}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Follow-up date */}
        {prescription.report_after_date && (
          <div className="mt-4 rounded-control border border-amber/40 bg-amber-wash px-3.5 py-2.5 text-sm font-medium text-ink">
            {labels.reportAfter(formatDate(locale, prescription.report_after_date))}
          </div>
        )}

        {/* Signature line */}
        <footer className="mt-6 flex justify-end pt-2">
          <div className="flex min-w-44 flex-col items-center gap-1 border-t border-ink pt-1.5 text-center">
            <span className="font-display text-base text-ink">{prescription.doctor.full_name}</span>
            <span className="text-[11px] text-ink-muted">{labels.signatureLabel}</span>
          </div>
        </footer>
      </div>
    </article>
  );
}
