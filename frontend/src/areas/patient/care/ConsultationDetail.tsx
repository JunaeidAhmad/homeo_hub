"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import type { components } from "@/api/schema";
import { TaskScreen } from "@/areas/patient/TaskScreen";
import { useSession } from "@/areas/patient/session/SessionProvider";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { StatusTimeline } from "@/components/StatusTimeline";
import { FormAlert, TextField } from "@/components/form/fields";
import { useDescribeErrorWith } from "@/hooks/use-describe-error";
import { useSubmitWith } from "@/hooks/use-submit";
import { numberFormat } from "@/i18n/format";
import type { PatientMessages } from "@/i18n/messages/patient";
import { useMessages } from "@/i18n/provider";

import { CONSULTATION_STATUS_META, URGENCY_BADGE, type ConsultationStatus } from "./status";

type Detail = components["schemas"]["PatientConsultationDetail"];
type HistoryItem = components["schemas"]["ConsultationHistory"];

const STEPS: {
  key: "submitted" | "assigned" | "inReview" | "prescribed" | "closed";
  statuses: ConsultationStatus[];
}[] = [
  { key: "submitted", statuses: ["SUBMITTED"] },
  { key: "assigned", statuses: ["ASSIGNED"] },
  { key: "inReview", statuses: ["IN_REVIEW", "AWAITING_PATIENT", "RESPONDED"] },
  { key: "prescribed", statuses: ["PRESCRIBED"] },
  { key: "closed", statuses: ["CLOSED"] },
];

function stepIndexFor(status: ConsultationStatus): number {
  return STEPS.findIndex((step) => step.statuses.includes(status));
}

function buildTimeline(history: HistoryItem[], status: ConsultationStatus) {
  const isCancelled = status === "CANCELLED";
  let completedCount = stepIndexFor(status);
  if (isCancelled) {
    completedCount = 0;
    for (const entry of history) {
      const idx = stepIndexFor(entry.to_status);
      if (idx >= 0) completedCount = Math.max(completedCount, idx + 1);
    }
  }
  const terminalEntry = isCancelled
    ? [...history].reverse().find((entry) => entry.to_status === "CANCELLED")
    : undefined;
  return { isCancelled, completedCount, terminalEntry };
}

export function ConsultationDetail({ caseId }: { caseId: string }) {
  const { locale, t } = useMessages<PatientMessages>();
  const session = useSession();
  const { api } = session;
  const describe = useDescribeErrorWith("patient");
  const { pending, problems, submit } = useSubmitWith(describe);

  const [caseData, setCaseData] = useState<Detail | null>(null);
  const [loadStatus, setLoadStatus] = useState<"loading" | "ready" | "error">("loading");
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [withdrawReason, setWithdrawReason] = useState("");

  const isGuest =
    session.status === "signedOut" || (session.status === "unavailable" && !session.hasSession);

  useEffect(() => {
    if (session.status !== "signedIn") return;
    const controller = new AbortController();
    api
      .GET("/api/v1/consultations/{id}/", {
        params: { path: { id: caseId } },
        signal: controller.signal,
      })
      .then(({ data }) => {
        if (data) {
          setCaseData(data);
          setLoadStatus("ready");
        } else {
          setLoadStatus("error");
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoadStatus("error");
      });
    return () => controller.abort();
  }, [api, caseId, session.status]);

  if (isGuest) {
    return (
      <TaskScreen title={t("patient.care.title")} backHref="/care">
        <div className="flex flex-col items-center gap-4 rounded-panel border border-line bg-surface p-6 text-center">
          <p className="text-base text-ink-soft">{t("patient.care.guest")}</p>
          <Link
            href={`/signin?next=/care/${caseId}`}
            className="flex min-h-13 items-center justify-center rounded-control bg-primary px-6 font-bold text-surface"
          >
            {t("patient.cart.signIn")}
          </Link>
        </div>
      </TaskScreen>
    );
  }

  if (loadStatus === "loading" || !caseData) {
    return (
      <TaskScreen title={t("patient.care.title")} backHref="/care">
        {loadStatus === "error" ? (
          <FormAlert>{t("patient.care.notFound")}</FormAlert>
        ) : (
          <p role="status" className="text-ink-muted">
            …
          </p>
        )}
      </TaskScreen>
    );
  }

  const meta = CONSULTATION_STATUS_META[caseData.status];
  const { isCancelled, completedCount, terminalEntry } = buildTimeline(
    caseData.history,
    caseData.status,
  );
  const timelineSteps = STEPS.map((step) => {
    const entry = caseData.history.find((item) => step.statuses.includes(item.to_status));
    return {
      key: step.key,
      label: t(`patient.care.step.${step.key}`),
      timestamp: entry?.created_at ?? null,
    };
  });

  function confirmWithdraw() {
    void submit(
      () =>
        api.POST("/api/v1/consultations/{id}/withdraw/", {
          params: { path: { id: caseId } },
          body: { reason: withdrawReason.trim() },
        }),
      (updated) => {
        setCaseData(updated);
        setWithdrawOpen(false);
        setWithdrawReason("");
      },
    );
  }

  return (
    <TaskScreen title={caseData.consultation_code} backHref="/care">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-control px-3 py-1 text-xs font-semibold ${meta.badgeClass}`}>
          {t(meta.labelKey)}
        </span>
        {caseData.urgency !== "ROUTINE" && (
          <span
            className={`rounded-control px-3 py-1 text-xs font-semibold ${URGENCY_BADGE[caseData.urgency]}`}
          >
            {t(`patient.care.urgency.${caseData.urgency}`)}
          </span>
        )}
      </div>

      <section className="rounded-panel border border-line bg-surface p-4">
        {caseData.doctor ? (
          <div className="flex flex-col gap-0.5">
            <p className="text-xs font-semibold text-ink-muted">
              {t("patient.care.doctorAssigned")}
            </p>
            <p className="text-base font-semibold text-primary-deep">
              {caseData.doctor.full_name}
            </p>
            {caseData.doctor.qualifications && (
              <p className="text-xs text-ink-soft">{caseData.doctor.qualifications}</p>
            )}
          </div>
        ) : (
          <p className="text-sm text-ink-soft">{t("patient.care.unassigned")}</p>
        )}
      </section>

      <section className="rounded-panel border border-line bg-surface p-4">
        <h2 className="pb-3 text-base font-semibold text-ink">{t("patient.care.timeline")}</h2>
        <StatusTimeline
          steps={timelineSteps}
          currentIndex={completedCount}
          allDone={caseData.status === "CLOSED"}
          terminalStop={
            isCancelled
              ? {
                  label: t("patient.care.status.CANCELLED"),
                  tone: "danger",
                  timestamp: terminalEntry?.created_at ?? null,
                }
              : null
          }
        />
      </section>

      <section className="flex flex-col gap-3 rounded-panel border border-line bg-surface p-4">
        <h2 className="text-base font-semibold text-ink">{t("patient.care.details")}</h2>
        <div>
          <p className="text-xs font-semibold text-ink-muted">
            {t("patient.care.chiefComplaint")}
          </p>
          <p className="text-base font-semibold text-ink">{caseData.chief_complaint}</p>
        </div>
        {caseData.illness && (
          <div>
            <p className="text-xs font-semibold text-ink-muted">{t("patient.care.illness")}</p>
            <p className="text-sm text-ink-soft">{caseData.illness.name}</p>
          </div>
        )}
        <div>
          <p className="text-xs font-semibold text-ink-muted">{t("patient.care.symptoms")}</p>
          <p className="whitespace-pre-line text-sm text-ink-soft">{caseData.symptoms}</p>
        </div>
        {caseData.duration_value !== null && caseData.duration_unit && (
          <div>
            <p className="text-xs font-semibold text-ink-muted">{t("patient.care.duration")}</p>
            <p className="text-sm text-ink-soft">
              {numberFormat(locale).format(caseData.duration_value)}{" "}
              {t(`patient.care.durationUnit.${caseData.duration_unit}`)}
            </p>
          </div>
        )}
        {caseData.symptom_notes && (
          <div>
            <p className="text-xs font-semibold text-ink-muted">
              {t("patient.care.symptomNotes")}
            </p>
            <p className="whitespace-pre-line text-sm text-ink-soft">
              {caseData.symptom_notes}
            </p>
          </div>
        )}
      </section>

      {caseData.status === "SUBMITTED" && (
        <div>
          <button
            type="button"
            disabled={pending}
            onClick={() => setWithdrawOpen(true)}
            className="min-h-12 w-full rounded-control border border-danger px-4 text-base font-semibold text-danger disabled:opacity-60"
          >
            {t("patient.care.withdraw")}
          </button>
        </div>
      )}

      <ConfirmDialog
        open={withdrawOpen}
        title={t("patient.care.withdrawTitle")}
        body={t("patient.care.withdrawBody")}
        confirmLabel={t("patient.care.withdrawConfirm")}
        cancelLabel={t("patient.care.withdrawKeep")}
        tone="danger"
        pending={pending}
        error={problems.form}
        onConfirm={confirmWithdraw}
        onClose={() => setWithdrawOpen(false)}
      >
        <TextField
          label={t("patient.care.withdrawReason")}
          value={withdrawReason}
          onChange={(event) => setWithdrawReason(event.target.value)}
          maxLength={300}
        />
      </ConfirmDialog>
    </TaskScreen>
  );
}
