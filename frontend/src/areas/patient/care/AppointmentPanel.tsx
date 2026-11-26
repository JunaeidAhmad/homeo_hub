"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import type { components } from "@/api/schema";
import { useSession } from "@/areas/patient/session/SessionProvider";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { AppointmentSlip } from "@/components/appointments/AppointmentSlip";
import { EventThread } from "@/components/appointments/EventThread";
import { FormAlert, TextField } from "@/components/form/fields";
import { useDescribeErrorWith } from "@/hooks/use-describe-error";
import { useSubmitWith } from "@/hooks/use-submit";
import { fill } from "@/i18n/catalog";
import { numberFormat } from "@/i18n/format";
import type { PatientMessages } from "@/i18n/messages/patient";
import { useMessages } from "@/i18n/provider";

type PatientAppointment = components["schemas"]["PatientAppointment"];

const ACTIVE_STATUSES = new Set([
  "PROPOSED",
  "RESCHEDULE_REQUESTED",
  "ACCEPTED",
  "IN_PROGRESS",
]);

export function AppointmentPanel({ caseId }: { caseId: string }) {
  const { locale, t } = useMessages<PatientMessages>();
  const { api } = useSession();
  const nf = numberFormat(locale);
  const describe = useDescribeErrorWith("patient");
  const { pending, problems, setProblems, submit } = useSubmitWith(describe);

  const [appointments, setAppointments] = useState<PatientAppointment[]>([]);
  const [notice, setNotice] = useState("");
  const [dialog, setDialog] = useState<"decline" | "cancel" | null>(null);
  const [noteInput, setNoteInput] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    api
      .GET("/api/v1/doctor-consultations/{id}/appointments/", {
        params: { path: { id: caseId } },
        signal: controller.signal,
      })
      .then(({ data }) => {
        if (data) setAppointments(data);
      })
      .catch(() => {
        // Handled cleanly as no appointments shown.
      });
    return () => controller.abort();
  }, [api, caseId]);

  const active = appointments.find((appt) => ACTIVE_STATUSES.has(appt.status)) ?? null;
  const latest = active ?? appointments[0] ?? null;

  if (!latest) return null;

  function applyUpdate(updated: PatientAppointment, msgKey: keyof PatientMessages) {
    setAppointments((prev) => [updated, ...prev.filter((row) => row.id !== updated.id)]);
    setNotice(t(msgKey));
    setDialog(null);
    setNoteInput("");
  }

  function handleAccept() {
    if (!latest) return;
    setNotice("");
    const apptId = latest.id;
    void submit(
      () =>
        api.POST("/api/v1/appointments/{id}/accept/", {
          params: { path: { id: apptId } },
        }),
      (updated) => applyUpdate(updated, "patient.call.acceptedNotice"),
    );
  }

  function confirmDialogAction() {
    if (!latest || !dialog) return;
    const apptId = latest.id;
    const action = dialog;
    void submit(
      () =>
        action === "decline"
          ? api.POST("/api/v1/appointments/{id}/reject/", {
              params: { path: { id: apptId } },
              body: { note: noteInput.trim() },
            })
          : api.POST("/api/v1/appointments/{id}/cancel/", {
              params: { path: { id: apptId } },
              body: { note: noteInput.trim() },
            }),
      (updated) =>
        applyUpdate(
          updated,
          action === "decline" ? "patient.call.rejectedNotice" : "patient.call.cancelledNotice",
        ),
    );
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-base font-semibold text-ink">{t("patient.call.heading")}</h2>

      {notice && (
        <p role="status" className="rounded-control bg-mist px-3.5 py-2.5 text-sm font-medium">
          {notice}
        </p>
      )}
      {problems.form && !dialog && <FormAlert>{problems.form}</FormAlert>}

      <AppointmentSlip
        locale={locale}
        startAt={latest.start_at}
        endAt={latest.end_at}
        status={latest.status}
        labels={{
          duration: fill(t("patient.call.durationMin"), {
            minutes: nf.format(latest.duration_minutes),
          }),
          statusText: t(`patient.call.status.${latest.status}`),
          relInHours: t("patient.call.rel.inHours"),
          relInHour: t("patient.call.rel.inHour"),
          relInMinutes: t("patient.call.rel.inMinutes"),
          relInMinute: t("patient.call.rel.inMinute"),
          relNow: t("patient.call.rel.now"),
          relPast: t("patient.call.rel.past"),
        }}
      />

      {latest.status === "PROPOSED" && (
        <div className="flex flex-col gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={handleAccept}
            className="min-h-13 rounded-control bg-primary px-5 text-base font-bold text-surface disabled:opacity-60"
          >
            {t("patient.call.acceptBtn")}
          </button>
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/care/${caseId}/appointments/${latest.id}/reschedule`}
              className="inline-flex min-h-11 flex-1 items-center justify-center rounded-control border border-line-strong bg-surface px-4 text-sm font-semibold text-ink"
            >
              {t("patient.call.askAnotherTimeBtn")}
            </Link>
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                setProblems({ fields: {} });
                setDialog("decline");
              }}
              className="min-h-11 rounded-control border border-line-strong bg-surface px-4 text-sm font-semibold text-danger"
            >
              {t("patient.call.declineBtn")}
            </button>
          </div>
        </div>
      )}

      {latest.status === "ACCEPTED" && (
        <button
          type="button"
          onClick={() => {
            setProblems({ fields: {} });
            setDialog("cancel");
          }}
          className="self-start text-sm font-semibold text-danger underline"
        >
          {t("patient.call.cancelBtn")}
        </button>
      )}

      {latest.events.length > 0 && (
        <details className="rounded-panel border border-line bg-surface px-4 py-3">
          <summary className="cursor-pointer list-none text-sm font-semibold text-ink">
            {t("patient.call.messagesSummary")} ({nf.format(latest.events.length)})
          </summary>
          <div className="pt-3">
            <EventThread
              locale={locale}
              events={latest.events}
              describeActor={(actor) =>
                t(
                  actor === "doctor"
                    ? "patient.call.actor.doctor"
                    : actor === "patient"
                      ? "patient.call.actor.patient"
                      : "patient.call.actor.system",
                )
              }
              describeKind={(kind) => t(`patient.call.event.${kind}`)}
            />
          </div>
        </details>
      )}

      <ConfirmDialog
        open={dialog !== null}
        title={t(
          dialog === "decline" ? "patient.call.declineTitle" : "patient.call.cancelTitle",
        )}
        body={t(dialog === "decline" ? "patient.call.declineBody" : "patient.call.cancelBody")}
        confirmLabel={t(
          dialog === "decline" ? "patient.call.confirmDecline" : "patient.call.confirmCancel",
        )}
        cancelLabel={t("patient.call.back")}
        tone="danger"
        pending={pending}
        error={problems.form}
        onConfirm={confirmDialogAction}
        onClose={() => setDialog(null)}
      >
        <TextField
          label={t("patient.call.declineNoteLabel")}
          value={noteInput}
          onChange={(event) => setNoteInput(event.target.value)}
          maxLength={500}
        />
      </ConfirmDialog>
    </section>
  );
}
