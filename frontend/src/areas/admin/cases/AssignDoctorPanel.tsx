"use client";

import { useEffect, useState } from "react";

import type { components } from "@/api/schema";
import { AreaMatchBadge } from "@/components/AreaMatchBadge";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { FormAlert, TextField } from "@/components/form/fields";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { fill } from "@/i18n/catalog";
import { formatMoney, numberFormat } from "@/i18n/format";
import type { AdminMessages } from "@/i18n/messages/admin";
import { useMessages } from "@/i18n/provider";

import { useStaffSession } from "../session";
import { useAdminSubmit } from "../use-admin-submit";

type CaseDetailData = components["schemas"]["AdminConsultationDetail"];
type AssignableDoctor = components["schemas"]["AssignableDoctor"];

const ASSIGN_ALLOWED_STATUSES = new Set([
  "SUBMITTED",
  "ASSIGNED",
  "IN_REVIEW",
  "AWAITING_PATIENT",
  "RESPONDED",
]);

export function AssignDoctorPanel({
  caseData,
  onAssigned,
}: {
  caseData: CaseDetailData;
  onAssigned: (next: CaseDetailData) => void;
}) {
  const { locale, t } = useMessages<AdminMessages>();
  const session = useStaffSession();
  const { api } = session;
  const { pending, problems, submit } = useAdminSubmit();

  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query.trim());
  const [doctors, setDoctors] = useState<AssignableDoctor[] | null>(null);
  const [confirmDoctor, setConfirmDoctor] = useState<AssignableDoctor | null>(null);
  const [note, setNote] = useState("");

  const canAssign =
    session.status === "signedIn" &&
    session.staff.permissions.includes("assign_cases") &&
    ASSIGN_ALLOWED_STATUSES.has(caseData.status);

  useEffect(() => {
    if (!canAssign) return;
    const controller = new AbortController();
    api
      .GET("/api/v1/admin/doctors/assignable/", {
        params: {
          query: {
            consultation_id: caseData.id,
            q: debouncedQuery || undefined,
          },
        },
        signal: controller.signal,
      })
      .then(({ data }) => {
        if (data) setDoctors(data);
      })
      .catch(() => {
        // Ignore aborted lookups.
      });
    return () => controller.abort();
  }, [api, canAssign, caseData.id, debouncedQuery]);

  if (!canAssign) return null;

  const isReassign = caseData.doctor !== null;

  function performAssign(target: AssignableDoctor, assignNote = "") {
    void submit(
      () =>
        api.POST("/api/v1/admin/doctor-consultations/{id}/assign/", {
          params: { path: { id: caseData.id } },
          body: { doctor_id: target.id, note: assignNote.trim() },
        }),
      (updated) => {
        onAssigned(updated);
        setConfirmDoctor(null);
        setNote("");
      },
    );
  }

  return (
    <section className="flex flex-col gap-4 rounded-panel border border-line bg-surface p-5">
      <h2 className="text-base font-semibold text-ink">
        {isReassign ? t("admin.cases.reassignTitle") : t("admin.cases.assignTitle")}
      </h2>
      {problems.form && <FormAlert>{problems.form}</FormAlert>}

      <TextField
        label={t("admin.cases.searchDoctor")}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        maxLength={100}
      />

      {doctors === null ? (
        <p role="status" className="text-sm text-ink-muted">
          {t("admin.loading")}
        </p>
      ) : doctors.length === 0 ? (
        <p className="text-sm text-ink-muted">{t("admin.cases.noDoctors")}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-line">
          {doctors.map((doc) => {
            const isCurrent = caseData.doctor?.id === doc.id;
            return (
              <li
                key={doc.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-ink">{doc.full_name}</span>
                    {doc.doctor_code && (
                      <span className="font-display text-xs text-primary">{doc.doctor_code}</span>
                    )}
                    <AreaMatchBadge match={doc.area_match} />
                  </div>
                  <p className="text-xs text-ink-soft">
                    {doc.area}
                    {doc.consultation_fee_poisha !== null
                      ? ` · ${formatMoney(locale, doc.consultation_fee_poisha)}`
                      : ""}
                    {" · "}
                    {fill(t("admin.cases.openCasesCount"), {
                      count: numberFormat(locale).format(doc.open_case_count),
                    })}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={pending || isCurrent}
                  onClick={() => {
                    if (isReassign) {
                      setNote("");
                      setConfirmDoctor(doc);
                    } else {
                      performAssign(doc);
                    }
                  }}
                  className="inline-flex min-h-11 items-center rounded-control bg-primary px-4 text-sm font-bold text-surface disabled:opacity-50"
                >
                  {t("admin.cases.assignBtn")}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <ConfirmDialog
        open={confirmDoctor !== null}
        title={
          confirmDoctor
            ? fill(t("admin.cases.reassignConfirmTitle"), { name: confirmDoctor.full_name })
            : ""
        }
        body={t("admin.cases.reassignConfirmBody")}
        confirmLabel={t("admin.cases.confirmAssign")}
        cancelLabel={t("admin.cases.cancel")}
        pending={pending}
        error={problems.form}
        onConfirm={() => {
          if (confirmDoctor) performAssign(confirmDoctor, note);
        }}
        onClose={() => setConfirmDoctor(null)}
      >
        <TextField
          label={t("admin.cases.assignNote")}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          maxLength={300}
        />
      </ConfirmDialog>
    </section>
  );
}
