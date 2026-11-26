"use client";

import { useEffect, useState, type FormEvent } from "react";

import type { components } from "@/api/schema";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { AppointmentSlip } from "@/components/appointments/AppointmentSlip";
import { EventThread } from "@/components/appointments/EventThread";
import { FormAlert, TextField } from "@/components/form/fields";
import { fill } from "@/i18n/catalog";
import { formatDateTime, numberFormat } from "@/i18n/format";
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
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");

  const [dateStr, setDateStr] = useState(() => dhakaDateValue(new Date()));
  const [timeStr, setTimeStr] = useState("16:30");
  const [duration, setDuration] = useState(20);
  const [note, setNote] = useState("");
  const [slotError, setSlotError] = useState<string | undefined>(undefined);

  useEffect(() => {
    const controller = new AbortController();
    api
      .GET("/api/v1/doctor/consultations/{id}/appointments/", {
        params: { path: { id: caseId } },
        signal: controller.signal,
      })
      .then(({ data }) => {
        if (data) setAppointments(data);
        setLoaded(true);
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoaded(true);
      });
    return () => controller.abort();
  }, [api, caseId]);

  const active = appointments.find((appt) => ACTIVE_STATUSES.has(appt.status)) ?? null;
  const latest = active ?? appointments[0] ?? null;

  const rescheduleRequestEvent =
    active?.status === "RESCHEDULE_REQUESTED"
      ? [...active.events].reverse().find((ev) => ev.kind === "RESCHEDULE_REQUESTED")
      : undefined;

  function applyPreferredSlot(iso: string) {
    setDateStr(dhakaDateValue(iso));
    setTimeStr(dhakaTimeValue(iso));
    setSlotError(undefined);
  }

  function submitSlot(event: FormEvent) {
    event.preventDefault();
    setNotice("");
    setSlotError(undefined);
    if (!dateStr || !timeStr) {
      setSlotError(t("doctor.call.needDateTime"));
      return;
    }
    const startAtIso = dhakaInputToIso(dateStr, timeStr);
    const body = {
      start_at: startAtIso,
      duration_minutes: duration,
      note: note.trim(),
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
          setAppointments((prev) => [updated, ...prev.filter((row) => row.id !== updated.id)]);
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
        setAppointments((prev) => [created, ...prev]);
        setNotice(t("doctor.call.proposedNotice"));
        setNote("");
      },
    );
  }

  function confirmCancel() {
    if (!active) return;
    const targetId = active.id;
    void submit(
      () =>
        api.POST("/api/v1/doctor/appointments/{id}/cancel/", {
          params: { path: { id: targetId } },
          body: { note: cancelReason.trim() },
        }),
      (updated) => {
        setAppointments((prev) => [updated, ...prev.filter((row) => row.id !== updated.id)]);
        setCancelOpen(false);
        setCancelReason("");
        setRescheduling(false);
        setNotice(t("doctor.call.cancelledNotice"));
      },
    );
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

  return (
    <div className="flex flex-col gap-5">
      {notice && (
        <p role="status" className="rounded-control bg-mist px-3.5 py-2.5 text-sm font-medium">
          {notice}
        </p>
      )}

      {latest && (
        <div className="flex flex-col gap-3">
          <AppointmentSlip
            locale={locale}
            startAt={latest.start_at}
            endAt={latest.end_at}
            status={latest.status}
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
                  setCancelOpen(true);
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
        open={cancelOpen}
        title={t("doctor.call.cancelTitle")}
        body={t("doctor.call.cancelBody")}
        confirmLabel={t("doctor.call.confirmCancel")}
        cancelLabel={t("doctor.call.keepBtn")}
        tone="danger"
        pending={pending}
        error={problems.form}
        onConfirm={confirmCancel}
        onClose={() => setCancelOpen(false)}
      >
        <TextField
          label={t("doctor.call.cancelReason")}
          value={cancelReason}
          onChange={(event) => setCancelReason(event.target.value)}
          maxLength={500}
        />
      </ConfirmDialog>
    </div>
  );
}
