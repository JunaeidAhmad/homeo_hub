"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { TaskScreen } from "@/areas/patient/TaskScreen";
import { useSession } from "@/areas/patient/session/SessionProvider";
import { FormAlert, SubmitBar, TextAreaField } from "@/components/form/fields";
import { useDescribeErrorWith } from "@/hooks/use-describe-error";
import { useSubmitWith } from "@/hooks/use-submit";
import type { PatientMessages } from "@/i18n/messages/patient";
import { useMessages } from "@/i18n/provider";
import { dhakaDateValue, dhakaInputToIso } from "@/lib/dhaka";

type SlotDraft = { id: string; date: string; time: string };

export function RescheduleRequestPage({
  caseId,
  apptId,
}: {
  caseId: string;
  apptId: string;
}) {
  const { t } = useMessages<PatientMessages>();
  const session = useSession();
  const router = useRouter();
  const describe = useDescribeErrorWith("patient");
  const { pending, problems, setProblems, submit } = useSubmitWith(describe);

  const [note, setNote] = useState("");
  const [slots, setSlots] = useState<SlotDraft[]>(() => [
    { id: "slot-1", date: dhakaDateValue(new Date()), time: "17:00" },
  ]);

  const isGuest =
    session.status === "signedOut" || (session.status === "unavailable" && !session.hasSession);

  if (isGuest) {
    return (
      <TaskScreen title={t("patient.call.rescheduleTitle")} backHref={`/care/${caseId}`}>
        <div className="flex flex-col items-center gap-4 rounded-panel border border-line bg-surface p-6 text-center">
          <p className="text-base text-ink-soft">{t("patient.care.guest")}</p>
          <Link
            href={`/signin?next=/care/${caseId}/appointments/${apptId}/reschedule`}
            className="flex min-h-13 items-center justify-center rounded-control bg-primary px-6 font-bold text-surface"
          >
            {t("patient.cart.signIn")}
          </Link>
        </div>
      </TaskScreen>
    );
  }

  function addSlot() {
    if (slots.length >= 3) return;
    setSlots((prev) => [
      ...prev,
      { id: `slot-${Date.now()}`, date: dhakaDateValue(new Date()), time: "18:00" },
    ]);
  }

  function updateSlot(id: string, patch: Partial<SlotDraft>) {
    setSlots((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }

  function removeSlot(id: string) {
    setSlots((prev) => prev.filter((row) => row.id !== id));
  }

  function sendRequest(event: FormEvent) {
    event.preventDefault();
    const preferredTimes = slots
      .filter((row) => row.date && row.time)
      .map((row) => dhakaInputToIso(row.date, row.time));
    if (!note.trim() && preferredTimes.length === 0) {
      setProblems({ form: t("patient.call.needSlotOrNote"), fields: {} });
      return;
    }

    void submit(
      () =>
        session.api.POST("/api/v1/appointments/{id}/reschedule-request/", {
          params: { path: { id: apptId } },
          body: {
            note: note.trim(),
            preferred_times: preferredTimes,
          },
        }),
      () => {
        router.replace(`/care/${caseId}`);
      },
    );
  }

  return (
    <TaskScreen title={t("patient.call.rescheduleTitle")} backHref={`/care/${caseId}`}>
      <p className="text-base text-ink-soft">{t("patient.call.rescheduleLead")}</p>

      <form onSubmit={sendRequest} noValidate className="flex flex-1 flex-col gap-5">
        {problems.form && <FormAlert>{problems.form}</FormAlert>}

        <div className="flex flex-col gap-3 rounded-panel border border-line bg-surface p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-ink">
              {t("patient.call.preferredHeading")}
            </h2>
            {slots.length < 3 && (
              <button
                type="button"
                onClick={addSlot}
                className="min-h-10 rounded-control border border-line-strong bg-surface px-3 text-xs font-semibold"
              >
                + {t("patient.call.addSlot")}
              </button>
            )}
          </div>

          {slots.map((slot) => (
            <div
              key={slot.id}
              className="grid items-end gap-2 rounded-control border border-line bg-mist p-3 desktop:grid-cols-[1fr_1fr_auto]"
            >
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-semibold text-ink">{t("patient.call.dateLabel")}</span>
                <input
                  type="date"
                  value={slot.date}
                  onChange={(event) => updateSlot(slot.id, { date: event.target.value })}
                  className="min-h-11 rounded-control border border-line-strong bg-surface px-3 text-sm"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-semibold text-ink">{t("patient.call.timeLabel")}</span>
                <input
                  type="time"
                  step={900}
                  value={slot.time}
                  onChange={(event) => updateSlot(slot.id, { time: event.target.value })}
                  className="min-h-11 rounded-control border border-line-strong bg-surface px-3 text-sm"
                />
              </label>
              <button
                type="button"
                onClick={() => removeSlot(slot.id)}
                className="min-h-11 rounded-control border border-line-strong bg-surface px-3 text-xs font-semibold text-danger"
              >
                {t("patient.call.removeSlot")}
              </button>
            </div>
          ))}
        </div>

        <TextAreaField
          label={t("patient.call.rescheduleNoteLabel")}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          maxLength={500}
        />

        <SubmitBar pending={pending}>{t("patient.call.submitReschedule")}</SubmitBar>
      </form>
    </TaskScreen>
  );
}
