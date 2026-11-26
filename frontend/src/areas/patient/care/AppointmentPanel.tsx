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

export type PatientAppointment = components["schemas"]["PatientAppointment"];
export type PatientCallStatus = components["schemas"]["PatientCallStatus"];

const ACTIVE_STATUSES = new Set([
  "PROPOSED",
  "RESCHEDULE_REQUESTED",
  "ACCEPTED",
  "IN_PROGRESS",
]);
const TEN_MIN_MS = 10 * 60_000;
const THIRTY_MIN_MS = 30 * 60_000;

export function useConsultationCall(caseId: string, enabled: boolean) {
  const { api } = useSession();
  const [appointments, setAppointments] = useState<PatientAppointment[]>([]);
  const [callState, setCallState] = useState<PatientCallStatus | null>(null);
  const [joinedUrl, setJoinedUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
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
        // Ignored cleanly when no appointments exist.
      });
    return () => controller.abort();
  }, [api, caseId, enabled]);

  const active = appointments.find((appt) => ACTIVE_STATUSES.has(appt.status)) ?? null;
  const activeId = active?.id ?? null;
  const activeStatus = active?.status ?? null;
  const activeStartAt = active?.start_at ?? null;

  useEffect(() => {
    if (!enabled || !activeId || !activeStartAt) return;
    if (activeStatus !== "ACCEPTED" && activeStatus !== "IN_PROGRESS") return;

    const startMs = new Date(activeStartAt).getTime();
    const inPollWindow = () => {
      const now = Date.now();
      return now >= startMs - TEN_MIN_MS && now <= startMs + THIRTY_MIN_MS;
    };

    const controller = new AbortController();
    function pollCall(signal?: AbortSignal) {
      if (!activeId) return;
      if (!inPollWindow() && activeStatus !== "IN_PROGRESS") return;
      api
        .GET("/api/v1/appointments/{id}/call/", {
          params: { path: { id: activeId } },
          signal,
        })
        .then(({ data, response }) => {
          if (response.status === 204 || !data) {
            setCallState(null);
            return;
          }
          setCallState(data);
        })
        .catch(() => {
          // Ignore transient polling failures.
        });
    }

    pollCall(controller.signal);
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === "visible") pollCall();
    }, 5_000);

    return () => {
      controller.abort();
      window.clearInterval(intervalId);
    };
  }, [api, activeId, activeStatus, activeStartAt, enabled]);

  return {
    appointments,
    setAppointments,
    active,
    latest: active ?? appointments[0] ?? null,
    callState,
    setCallState,
    joinedUrl,
    setJoinedUrl,
  };
}

export function IncomingCallBanner({
  callState,
  joinedUrl,
  onJoin,
  pending,
}: {
  callState: PatientCallStatus | null;
  joinedUrl: string | null;
  onJoin: () => void;
  pending: boolean;
}) {
  const { t } = useMessages<PatientMessages>();
  if (!callState) return null;

  if (callState.status === "LIVE" || joinedUrl) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-panel border border-line bg-mist p-4 text-ink">
        <div>
          <p className="font-semibold">{t("patient.call.joinedTitle")}</p>
          <p className="text-xs text-ink-muted">{t("patient.call.notRecorded")}</p>
        </div>
        <button
          type="button"
          disabled={pending}
          onClick={onJoin}
          className="min-h-11 rounded-control border border-line-strong bg-surface px-4 text-sm font-semibold text-ink disabled:opacity-60"
        >
          {t("patient.call.openAgainBtn")}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-panel bg-primary p-4 text-surface">
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className="relative mt-1.5 flex size-3 shrink-0">
          <span className="absolute inline-flex size-full rounded-full bg-surface opacity-75 motion-safe:animate-ping" />
          <span className="relative inline-flex size-3 rounded-full bg-surface" />
        </span>
        <div>
          <p className="text-lg font-bold">
            {fill(t("patient.call.ringingTitle"), { name: callState.doctor_name })}
          </p>
          <p className="text-xs opacity-90">{t("patient.call.notRecorded")}</p>
        </div>
      </div>
      <button
        type="button"
        disabled={pending}
        onClick={onJoin}
        className="min-h-12 w-full rounded-control bg-surface px-5 text-base font-bold text-primary-deep disabled:opacity-60 desktop:w-auto"
      >
        {t("patient.call.joinBtn")}
      </button>
    </div>
  );
}

export function AppointmentPanel({
  caseId,
  latest,
  onAppointmentsChange,
}: {
  caseId: string;
  latest: PatientAppointment | null;
  onAppointmentsChange: (updated: PatientAppointment) => void;
}) {
  const { locale, t } = useMessages<PatientMessages>();
  const { api } = useSession();
  const nf = numberFormat(locale);
  const describe = useDescribeErrorWith("patient");
  const { pending, problems, setProblems, submit } = useSubmitWith(describe);

  const [notice, setNotice] = useState("");
  const [dialog, setDialog] = useState<"decline" | "cancel" | null>(null);
  const [noteInput, setNoteInput] = useState("");
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  if (!latest) return null;

  function applyUpdate(updated: PatientAppointment, msgKey: keyof PatientMessages) {
    onAppointmentsChange(updated);
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

  const startMs = new Date(latest.start_at).getTime();
  const inWaitingWindow =
    (latest.status === "ACCEPTED" || latest.status === "IN_PROGRESS") &&
    nowMs >= startMs - TEN_MIN_MS &&
    nowMs <= startMs + THIRTY_MIN_MS;

  const footerParts: string[] = [];
  if (inWaitingWindow && latest.status === "ACCEPTED") {
    footerParts.push(t("patient.call.waitHereHint"));
  }
  if (latest.meeting_host) {
    footerParts.push(fill(t("patient.call.opensInHost"), { host: latest.meeting_host }));
  }
  if (latest.status === "ACCEPTED" || latest.status === "IN_PROGRESS") {
    footerParts.push(t("patient.call.notRecorded"));
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
        footerNote={footerParts.join(" · ") || undefined}
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
