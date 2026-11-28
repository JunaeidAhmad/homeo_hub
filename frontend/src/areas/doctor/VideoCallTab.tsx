"use client";

import { useEffect, useState, type FormEvent } from "react";

import type { components } from "@/api/schema";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { AppointmentSlip } from "@/components/appointments/AppointmentSlip";
import { EventThread } from "@/components/appointments/EventThread";
import { FormAlert, TextField } from "@/components/form/fields";
import { fill } from "@/i18n/catalog";
import { formatDateTime, formatTime, numberFormat } from "@/i18n/format";
import type { DoctorMessages } from "@/i18n/messages/doctor";
import { useMessages } from "@/i18n/provider";
import { dhakaDateValue, dhakaInputToIso, dhakaTimeValue } from "@/lib/dhaka";

import { useDoctorSession } from "./session";
import { useDoctorSubmit } from "./use-doctor-submit";

type DoctorAppointment = components["schemas"]["DoctorAppointment"];
type CaseStatus = components["schemas"]["ConsultationStatusEnum"];

const ACTIVE_STATUSES = new Set([
  "PROPOSED",
  "RESCHEDULE_REQUESTED",
  "ACCEPTED",
  "IN_PROGRESS",
]);
const PROPOSE_ALLOWED_CASES = new Set(["IN_REVIEW", "AWAITING_PATIENT", "RESPONDED"]);
const DURATIONS = [10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60];
const TEN_MIN_MS = 10 * 60_000;
const FIFTEEN_MIN_MS = 15 * 60_000;

function formatElapsed(startedIso: string, nowMs: number): string {
  const totalSec = Math.max(0, Math.floor((nowMs - new Date(startedIso).getTime()) / 1000));
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export function VideoCallTab({
  caseId,
  caseStatus,
}: {
  caseId: string;
  caseStatus: CaseStatus;
}) {
  const { locale, t } = useMessages<DoctorMessages>();
  const { api } = useDoctorSession();
  const { pending, problems, setProblems, submit } = useDoctorSubmit();
  const nf = numberFormat(locale);

  const [appointments, setAppointments] = useState<DoctorAppointment[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [notice, setNotice] = useState("");
  const [rescheduling, setRescheduling] = useState(false);
  const [dialog, setDialog] = useState<"cancel" | "start" | "end" | "noShow" | null>(null);
  const [cancelReason, setCancelReason] = useState("");

  const [dateStr, setDateStr] = useState(() => dhakaDateValue(new Date()));
  const [timeStr, setTimeStr] = useState("16:30");
  const [duration, setDuration] = useState(20);
  const [note, setNote] = useState("");
  const [slotError, setSlotError] = useState<string | undefined>(undefined);

  const [linkInput, setLinkInput] = useState("");
  const [linkError, setLinkError] = useState<string | undefined>(undefined);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const controller = new AbortController();
    api
      .GET("/api/v1/doctor/consultations/{id}/appointments/", {
        params: { path: { id: caseId } },
        signal: controller.signal,
      })
      .then(({ data }) => {
        if (data) {
          setAppointments(data);
          const current = data.find((row) => ACTIVE_STATUSES.has(row.status));
          if (current?.meeting_link) setLinkInput(current.meeting_link);
        }
        setLoaded(true);
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoaded(true);
      });
    return () => controller.abort();
  }, [api, caseId]);

  const active = appointments.find((appt) => ACTIVE_STATUSES.has(appt.status)) ?? null;
  const latest = active ?? appointments[0] ?? null;
  const activeCallId = active?.active_call?.id ?? null;
  const isRinging = active?.active_call?.status === "RINGING";

  // Live timer (1s when a call is active, 10s otherwise to refresh window boundaries).
  useEffect(() => {
    const stepMs = activeCallId ? 1000 : 10_000;
    const id = window.setInterval(() => setNowMs(Date.now()), stepMs);
    return () => window.clearInterval(id);
  }, [activeCallId]);

  // Poll appointments every 5s while waiting for patient to join a ringing call.
  useEffect(() => {
    if (!isRinging) return;
    const id = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void api
        .GET("/api/v1/doctor/consultations/{id}/appointments/", {
          params: { path: { id: caseId } },
        })
        .then(({ data }) => {
          if (data) setAppointments(data);
        })
        .catch(() => {
          // Ignore transient polling hiccups.
        });
    }, 5_000);
    return () => window.clearInterval(id);
  }, [api, caseId, isRinging]);

  const rescheduleRequestEvent =
    active?.status === "RESCHEDULE_REQUESTED"
      ? [...active.events].reverse().find((ev) => ev.kind === "RESCHEDULE_REQUESTED")
      : undefined;

  function applyPreferredSlot(iso: string) {
    setDateStr(dhakaDateValue(iso));
    setTimeStr(dhakaTimeValue(iso));
    setSlotError(undefined);
  }

  function upsertAppointment(updated: DoctorAppointment) {
    setAppointments((prev) => [updated, ...prev.filter((row) => row.id !== updated.id)]);
  }

  function submitSlot(event: FormEvent) {
    event.preventDefault();
    setNotice("");
    setSlotError(undefined);
    if (!dateStr || !timeStr) {
      setSlotError(t("doctor.call.needDateTime"));
      return;
    }
    const trimmedLink = linkInput.trim();
    if (trimmedLink && !trimmedLink.startsWith("https://")) {
      setLinkError(t("doctor.call.invalidLink"));
      return;
    }
    const startAtIso = dhakaInputToIso(dateStr, timeStr);
    const body = {
      start_at: startAtIso,
      duration_minutes: duration,
      note: note.trim(),
      meeting_link: trimmedLink,
    };

    if (active && (active.status === "RESCHEDULE_REQUESTED" || active.status === "ACCEPTED")) {
      const targetId = active.id;
      void submit(
        () =>
          api.POST("/api/v1/doctor/appointments/{id}/repropose/", {
            params: { path: { id: targetId } },
            body,
          }),
        (updated) => {
          upsertAppointment(updated);
          setLinkInput(updated.meeting_link);
          setNotice(
            t(
              active.status === "ACCEPTED"
                ? "doctor.call.rescheduledNotice"
                : "doctor.call.proposedNotice",
            ),
          );
          setRescheduling(false);
          setNote("");
        },
      );
      return;
    }

    void submit(
      () =>
        api.POST("/api/v1/doctor/consultations/{id}/appointments/", {
          params: { path: { id: caseId } },
          body,
        }),
      (created) => {
        upsertAppointment(created);
        setLinkInput(created.meeting_link);
        setNotice(t("doctor.call.proposedNotice"));
        setNote("");
      },
    );
  }

  function saveLink(event: FormEvent) {
    event.preventDefault();
    if (!active) return;
    setNotice("");
    setLinkError(undefined);
    const trimmed = linkInput.trim();
    if (!trimmed.startsWith("https://")) {
      setLinkError(t("doctor.call.invalidLink"));
      return;
    }
    const targetId = active.id;
    void submit(
      () =>
        api.PATCH("/api/v1/doctor/appointments/{id}/", {
          params: { path: { id: targetId } },
          body: { meeting_link: trimmed },
        }),
      (updated) => {
        upsertAppointment(updated);
        setLinkInput(updated.meeting_link);
        setNotice(t("doctor.call.linkSavedNotice"));
      },
    );
  }

  function confirmDialogAction() {
    if (!active || !dialog) return;
    const apptId = active.id;

    if (dialog === "cancel") {
      void submit(
        () =>
          api.POST("/api/v1/doctor/appointments/{id}/cancel/", {
            params: { path: { id: apptId } },
            body: { note: cancelReason.trim() },
          }),
        (updated) => {
          upsertAppointment(updated);
          setDialog(null);
          setCancelReason("");
          setRescheduling(false);
          setNotice(t("doctor.call.cancelledNotice"));
        },
      );
      return;
    }

    if (dialog === "start") {
      void submit(
        () =>
          api.POST("/api/v1/doctor/appointments/{id}/start/", {
            params: { path: { id: apptId } },
          }),
        (started) => {
          setDialog(null);
          setNotice(t("doctor.call.startedNotice"));
          window.open(started.join_url, "_blank", "noopener");
          void api
            .GET("/api/v1/doctor/consultations/{id}/appointments/", {
              params: { path: { id: caseId } },
            })
            .then(({ data }) => {
              if (data) setAppointments(data);
            });
        },
      );
      return;
    }

    if (dialog === "end" && active.active_call) {
      const callId = active.active_call.id;
      void submit(
        () =>
          api.POST("/api/v1/doctor/calls/{id}/end/", {
            params: { path: { id: callId } },
          }),
        (updated) => {
          upsertAppointment(updated);
          setDialog(null);
          setNotice(t("doctor.call.endedNotice"));
        },
      );
      return;
    }

    if (dialog === "noShow") {
      void submit(
        () =>
          api.POST("/api/v1/doctor/appointments/{id}/no-show/", {
            params: { path: { id: apptId } },
          }),
        (updated) => {
          upsertAppointment(updated);
          setDialog(null);
          setNotice(t("doctor.call.noShowNotice"));
        },
      );
    }
  }

  if (!loaded) {
    return (
      <p role="status" className="text-sm text-ink-muted">
        {t("doctor.loading")}
      </p>
    );
  }

  const slotProblem =
    slotError ??
    (problems.code === "TOO_SOON" || problems.code === "DOCTOR_TIME_TAKEN"
      ? problems.form
      : undefined);

  const showProposeForm =
    (!active && PROPOSE_ALLOWED_CASES.has(caseStatus)) ||
    active?.status === "RESCHEDULE_REQUESTED" ||
    (active?.status === "ACCEPTED" && rescheduling);

  const startAtMs = active ? new Date(active.start_at).getTime() : 0;
  const inStartWindow =
    active !== null &&
    nowMs >= startAtMs - TEN_MIN_MS &&
    nowMs <= startAtMs + FIFTEEN_MIN_MS;
  const canMarkNoShow =
    active !== null &&
    (active.status === "ACCEPTED" || active.status === "IN_PROGRESS") &&
    !active.has_patient_joined &&
    nowMs >= startAtMs + TEN_MIN_MS;
  const windowOpensIso = active ? new Date(startAtMs - TEN_MIN_MS).toISOString() : null;

  return (
    <div className="flex flex-col gap-5">
      {notice && (
        <p role="status" className="rounded-control bg-mist px-3.5 py-2.5 text-sm font-medium">
          {notice}
        </p>
      )}

      {/* Live call banner */}
      {active?.active_call && (
        <div className="flex flex-col gap-3 rounded-panel bg-primary p-4 text-surface">
          <p className="text-lg font-bold">
            {fill(t("doctor.call.inProgressTimer"), {
              timer: formatElapsed(active.active_call.started_at, nowMs),
            })}
          </p>
          {active.active_call.patient_joined_at ? (
            <p className="text-sm">
              {fill(t("doctor.call.patientJoinedAt"), {
                time: formatTime(locale, active.active_call.patient_joined_at),
              })}
            </p>
          ) : (
            <p className="self-start rounded-control bg-amber-wash px-2.5 py-1 text-xs font-semibold text-ink">
              {t("doctor.call.waitingForPatient")}
            </p>
          )}
          <p className="text-xs opacity-90">{t("doctor.call.notRecorded")}</p>
          <div className="flex flex-wrap gap-2">
            {active.meeting_link && (
              <button
                type="button"
                onClick={() => window.open(active.meeting_link, "_blank", "noopener")}
                className="min-h-11 rounded-control bg-surface px-4 text-sm font-bold text-primary-deep"
              >
                {t("doctor.call.openMeetingBtn")}
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setProblems({ fields: {} });
                setDialog("end");
              }}
              className="min-h-11 rounded-control bg-danger px-4 text-sm font-bold text-surface"
            >
              {t("doctor.call.endBtn")}
            </button>
          </div>
        </div>
      )}

      {latest && (
        <div className="flex flex-col gap-3">
          <AppointmentSlip
            locale={locale}
            startAt={latest.start_at}
            endAt={latest.end_at}
            status={latest.status}
            footerNote={t("doctor.call.notRecorded")}
            labels={{
              duration: fill(t("doctor.call.durationMin"), {
                minutes: nf.format(latest.duration_minutes),
              }),
              statusText: t(`doctor.call.status.${latest.status}`),
              relInHours: t("doctor.call.rel.inHours"),
              relInHour: t("doctor.call.rel.inHour"),
              relInMinutes: t("doctor.call.rel.inMinutes"),
              relInMinute: t("doctor.call.rel.inMinute"),
              relNow: t("doctor.call.rel.now"),
              relPast: t("doctor.call.rel.past"),
            }}
          />

          {/* Meeting link field while PROPOSED / ACCEPTED */}
          {active &&
            !showProposeForm &&
            (active.status === "PROPOSED" || active.status === "ACCEPTED") && (
              <form
                onSubmit={saveLink}
                noValidate
                className="flex flex-col gap-3 rounded-panel border border-line bg-surface p-4"
              >
                <TextField
                  label={t("doctor.call.linkLabel")}
                  value={linkInput}
                  onChange={(event) => {
                    setLinkInput(event.target.value);
                    setLinkError(undefined);
                  }}
                  error={linkError ?? problems.fields.meeting_link}
                  placeholder="https://meet.google.com/..."
                  maxLength={500}
                />
                <div className="flex flex-wrap items-center justify-between gap-2">
                  {active.meeting_host ? (
                    <span className="text-xs font-semibold text-primary-deep">
                      {fill(t("doctor.call.opensInHost"), { host: active.meeting_host })}
                    </span>
                  ) : (
                    <span />
                  )}
                  <button
                    type="submit"
                    disabled={pending}
                    className="min-h-10 rounded-control border border-line-strong bg-surface px-4 text-sm font-semibold text-ink disabled:opacity-60"
                  >
                    {t("doctor.call.saveLinkBtn")}
                  </button>
                </div>
              </form>
            )}

          {/* Start call, No-show, Reschedule, Cancel */}
          {active &&
            (active.status === "ACCEPTED" || active.status === "IN_PROGRESS") &&
            !active.active_call && (
              <div className="flex flex-col gap-2 rounded-panel border border-line bg-surface p-4">
                <button
                  type="button"
                  disabled={pending || !inStartWindow || !active.meeting_link}
                  onClick={() => {
                    setProblems({ fields: {} });
                    setDialog("start");
                  }}
                  className="min-h-12 rounded-control bg-primary px-5 text-base font-bold text-surface disabled:opacity-50"
                >
                  {t("doctor.call.startBtn")}
                </button>
                {!active.meeting_link ? (
                  <p className="text-xs text-ink-muted">{t("doctor.error.NO_MEETING_LINK")}</p>
                ) : !inStartWindow && windowOpensIso && nowMs < startAtMs - TEN_MIN_MS ? (
                  <p className="text-xs text-ink-muted">
                    {fill(t("doctor.call.startWindowHint"), {
                      time: formatTime(locale, windowOpensIso),
                    })}
                  </p>
                ) : null}
                {canMarkNoShow && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => {
                      setProblems({ fields: {} });
                      setDialog("noShow");
                    }}
                    className="min-h-10 self-start text-sm font-semibold text-danger underline"
                  >
                    {t("doctor.call.noShowBtn")}
                  </button>
                )}
              </div>
            )}

          {active && (active.status === "PROPOSED" || active.status === "ACCEPTED") && (
            <div className="flex flex-wrap gap-2">
              {active.status === "ACCEPTED" && (
                <button
                  type="button"
                  onClick={() => {
                    setProblems({ fields: {} });
                    if (!rescheduling) {
                      setDateStr(dhakaDateValue(active.start_at));
                      setTimeStr(dhakaTimeValue(active.start_at));
                      setDuration(active.duration_minutes);
                    }
                    setRescheduling((v) => !v);
                  }}
                  className="min-h-11 rounded-control border border-line-strong bg-surface px-4 text-sm font-semibold text-ink"
                >
                  {t(rescheduling ? "doctor.call.cancelEditBtn" : "doctor.call.rescheduleBtn")}
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setProblems({ fields: {} });
                  setDialog("cancel");
                }}
                className="min-h-11 rounded-control border border-line-strong bg-surface px-4 text-sm font-semibold text-danger"
              >
                {t("doctor.call.cancelBtn")}
              </button>
            </div>
          )}
        </div>
      )}

      {showProposeForm && (
        <form
          onSubmit={submitSlot}
          noValidate
          className="flex flex-col gap-4 rounded-panel border border-line bg-surface p-4"
        >
          <h3 className="text-base font-semibold text-ink">
            {t(
              active?.status === "RESCHEDULE_REQUESTED"
                ? "doctor.call.reproposeHeading"
                : active?.status === "ACCEPTED"
                  ? "doctor.call.rescheduleHeading"
                  : "doctor.call.proposeHeading",
            )}
          </h3>

          {rescheduleRequestEvent && rescheduleRequestEvent.preferred_times.length > 0 && (
            <div className="flex flex-col gap-2 rounded-control bg-mist p-3">
              <p className="text-xs font-semibold text-ink-muted">
                {t("doctor.call.preferredHeading")}
              </p>
              <div className="flex flex-wrap gap-2">
                {rescheduleRequestEvent.preferred_times.map((iso) => (
                  <button
                    key={iso}
                    type="button"
                    onClick={() => applyPreferredSlot(iso)}
                    className="min-h-9 rounded-control border border-line-strong bg-surface px-3 text-xs font-semibold text-primary-deep hover:bg-mist"
                  >
                    {formatDateTime(locale, iso)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {problems.form && !slotProblem && <FormAlert>{problems.form}</FormAlert>}
          {slotProblem && <FormAlert>{slotProblem}</FormAlert>}

          <div className="grid gap-3 desktop:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-semibold text-ink">{t("doctor.call.date")}</span>
              <input
                type="date"
                value={dateStr}
                onChange={(event) => {
                  setDateStr(event.target.value);
                  setSlotError(undefined);
                }}
                className="min-h-11 rounded-control border border-line-strong bg-surface px-3 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-semibold text-ink">{t("doctor.call.time")}</span>
              <input
                type="time"
                step={900}
                value={timeStr}
                onChange={(event) => {
                  setTimeStr(event.target.value);
                  setSlotError(undefined);
                }}
                className="min-h-11 rounded-control border border-line-strong bg-surface px-3 text-sm"
              />
            </label>
          </div>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-semibold text-ink">{t("doctor.call.duration")}</span>
            <select
              value={duration}
              onChange={(event) => setDuration(Number(event.target.value))}
              className="min-h-11 rounded-control border border-line-strong bg-surface px-3 text-sm"
            >
              {DURATIONS.map((mins) => (
                <option key={mins} value={mins}>
                  {fill(t("doctor.call.durationMin"), { minutes: nf.format(mins) })}
                </option>
              ))}
            </select>
          </label>

          <TextField
            label={t("doctor.call.linkLabel")}
            hint={t("doctor.call.linkHint")}
            value={linkInput}
            onChange={(event) => {
              setLinkInput(event.target.value);
              setLinkError(undefined);
            }}
            error={linkError ?? problems.fields.meeting_link}
            placeholder="https://meet.google.com/..."
            maxLength={500}
          />

          <TextField
            label={t("doctor.call.note")}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            maxLength={500}
          />

          <button
            type="submit"
            disabled={pending}
            className="min-h-12 rounded-control bg-primary px-5 text-base font-bold text-surface disabled:opacity-60"
          >
            {t("doctor.call.proposeBtn")}
          </button>
        </form>
      )}

      {latest && latest.events.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-ink-muted">{t("doctor.call.threadHeading")}</h3>
          <EventThread
            locale={locale}
            events={latest.events}
            describeActor={(actor) =>
              t(
                actor === "patient"
                  ? "doctor.call.actor.patient"
                  : actor === "doctor"
                    ? "doctor.call.actor.doctor"
                    : "doctor.call.actor.system",
              )
            }
            describeKind={(kind) => t(`doctor.call.event.${kind}`)}
          />
        </section>
      )}

      <ConfirmDialog
        open={dialog !== null}
        title={t(
          dialog === "start"
            ? "doctor.call.startDialogTitle"
            : dialog === "end"
              ? "doctor.call.endTitle"
              : dialog === "noShow"
                ? "doctor.call.noShowTitle"
                : "doctor.call.cancelTitle",
        )}
        body={t(
          dialog === "start"
            ? "doctor.call.startDialogBody"
            : dialog === "end"
              ? "doctor.call.endBody"
              : dialog === "noShow"
                ? "doctor.call.noShowBody"
                : "doctor.call.cancelBody",
        )}
        confirmLabel={t(
          dialog === "start"
            ? "doctor.call.startConfirm"
            : dialog === "end"
              ? "doctor.call.endBtn"
              : dialog === "noShow"
                ? "doctor.call.noShowBtn"
                : "doctor.call.confirmCancel",
        )}
        cancelLabel={t("doctor.call.keepBtn")}
        tone={dialog === "start" ? "primary" : "danger"}
        pending={pending}
        error={problems.form}
        onConfirm={confirmDialogAction}
        onClose={() => setDialog(null)}
      >
        {dialog === "cancel" && (
          <TextField
            label={t("doctor.call.cancelReason")}
            value={cancelReason}
            onChange={(event) => setCancelReason(event.target.value)}
            maxLength={500}
          />
        )}
      </ConfirmDialog>
    </div>
  );
}
