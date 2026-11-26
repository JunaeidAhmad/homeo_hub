"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

import type { components } from "@/api/schema";
import { useApiClient } from "@/api/use-api-client";
import { TaskScreen } from "@/areas/patient/TaskScreen";
import { useSession } from "@/areas/patient/session/SessionProvider";
import {
  FieldError,
  FormAlert,
  SegmentedChoice,
  SubmitBar,
  TextAreaField,
  TextField,
} from "@/components/form/fields";
import { useDescribeErrorWith } from "@/hooks/use-describe-error";
import { useSubmitWith } from "@/hooks/use-submit";
import type { PatientMessages } from "@/i18n/messages/patient";
import { useMessages } from "@/i18n/provider";
import { toAsciiDigits } from "@/lib/digits";

import type { ConsultationUrgency, DurationUnit } from "./status";

type IllnessOption = components["schemas"]["PublicIllnessSummary"];
const DURATION_UNITS: readonly DurationUnit[] = ["DAYS", "WEEKS", "MONTHS", "YEARS"];

export function ConsultationForm() {
  const { t } = useMessages<PatientMessages>();
  const session = useSession();
  const publicClient = useApiClient();
  const router = useRouter();
  const describe = useDescribeErrorWith("patient", (field) =>
    field === "duration_value" ? "patient.error.duration" : undefined,
  );
  const { pending, problems, setProblems, submit } = useSubmitWith(describe);

  const [illnesses, setIllnesses] = useState<IllnessOption[]>([]);
  const [illnessId, setIllnessId] = useState("");
  const [chiefComplaint, setChiefComplaint] = useState("");
  const [symptoms, setSymptoms] = useState("");
  const [durationText, setDurationText] = useState("");
  const [durationUnit, setDurationUnit] = useState<DurationUnit>("DAYS");
  const [symptomNotes, setSymptomNotes] = useState("");
  const [urgency, setUrgency] = useState<ConsultationUrgency>("ROUTINE");

  useEffect(() => {
    const controller = new AbortController();
    publicClient
      .GET("/api/v1/illness-categories/", { signal: controller.signal })
      .then(({ data }) => {
        if (data) {
          setIllnesses(data.flatMap((category) => category.illnesses));
        }
      })
      .catch(() => {
        // Optional helper dropdown; ignore lookup failures cleanly.
      });
    return () => controller.abort();
  }, [publicClient]);

  const isGuest =
    session.status === "signedOut" || (session.status === "unavailable" && !session.hasSession);

  if (isGuest) {
    return (
      <TaskScreen title={t("patient.care.newTitle")} backHref="/care">
        <div className="flex flex-col items-center gap-4 rounded-panel border border-line bg-surface p-6 text-center">
          <p className="text-base text-ink-soft">{t("patient.care.guest")}</p>
          <Link
            href="/signin?next=/care/new"
            className="flex min-h-13 items-center justify-center rounded-control bg-primary px-6 font-bold text-surface"
          >
            {t("patient.cart.signIn")}
          </Link>
        </div>
      </TaskScreen>
    );
  }

  function submitCase(event: FormEvent) {
    event.preventDefault();
    const fields: Record<string, string> = {};
    if (!chiefComplaint.trim()) fields.chief_complaint = t("patient.error.required");
    if (!symptoms.trim()) fields.symptoms = t("patient.error.required");

    const rawDuration = toAsciiDigits(durationText).trim();
    let parsedDuration: number | null = null;
    if (rawDuration) {
      parsedDuration = Number(rawDuration);
      if (!Number.isInteger(parsedDuration) || parsedDuration < 1 || parsedDuration > 200) {
        fields.duration_value = t("patient.error.duration");
      }
    }

    if (Object.keys(fields).length > 0) {
      setProblems({ fields });
      return;
    }

    void submit(
      () =>
        session.api.POST("/api/v1/consultations/", {
          body: {
            illness_id: illnessId || null,
            chief_complaint: chiefComplaint.trim(),
            symptoms: symptoms.trim(),
            duration_value: parsedDuration,
            duration_unit: parsedDuration !== null ? durationUnit : "",
            symptom_notes: symptomNotes.trim(),
            urgency,
          },
        }),
      (created) => {
        router.replace(`/care/${created.id}`);
      },
    );
  }

  return (
    <TaskScreen title={t("patient.care.newTitle")} backHref="/care">
      <p className="text-base text-ink-soft">{t("patient.care.newNote")}</p>

      <form onSubmit={submitCase} noValidate className="flex flex-1 flex-col gap-5">
        {problems.form && <FormAlert>{problems.form}</FormAlert>}

        {illnesses.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <label htmlFor="care-illness" className="text-[15px] font-semibold">
              {t("patient.care.illness")}
            </label>
            <select
              id="care-illness"
              value={illnessId}
              onChange={(event) => setIllnessId(event.target.value)}
              className="min-h-13 rounded-control border border-line-strong bg-surface px-3.5 text-[17px]"
            >
              <option value="">{t("patient.care.illnessNone")}</option>
              {illnesses.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <TextField
          label={t("patient.care.chiefComplaint")}
          hint={t("patient.care.chiefComplaintHint")}
          error={problems.fields.chief_complaint}
          value={chiefComplaint}
          onChange={(event) => setChiefComplaint(event.target.value)}
          maxLength={200}
        />

        <TextAreaField
          label={t("patient.care.symptoms")}
          hint={t("patient.care.symptomsHint")}
          error={problems.fields.symptoms}
          value={symptoms}
          onChange={(event) => setSymptoms(event.target.value)}
          maxLength={4000}
        />

        <div className="flex flex-col gap-1.5">
          <label htmlFor="care-duration" className="text-[15px] font-semibold">
            {t("patient.care.duration")}
          </label>
          <div className="grid grid-cols-[1fr_1.4fr] gap-2">
            <input
              id="care-duration"
              value={durationText}
              onChange={(event) => setDurationText(event.target.value)}
              inputMode="numeric"
              maxLength={3}
              className={`min-h-13 rounded-control border bg-surface px-3.5 text-[17px] ${
                problems.fields.duration_value ? "border-danger" : "border-line-strong"
              }`}
            />
            <select
              aria-label={t("patient.care.duration")}
              value={durationUnit}
              onChange={(event) => setDurationUnit(event.target.value as DurationUnit)}
              className="min-h-13 rounded-control border border-line-strong bg-surface px-3.5 text-[17px]"
            >
              {DURATION_UNITS.map((unit) => (
                <option key={unit} value={unit}>
                  {t(`patient.care.durationUnit.${unit}`)}
                </option>
              ))}
            </select>
          </div>
          {problems.fields.duration_value && (
            <FieldError>{problems.fields.duration_value}</FieldError>
          )}
        </div>

        <TextAreaField
          label={t("patient.care.symptomNotes")}
          hint={t("patient.care.symptomNotesHint")}
          value={symptomNotes}
          onChange={(event) => setSymptomNotes(event.target.value)}
          maxLength={4000}
        />

        <SegmentedChoice
          legend={t("patient.care.urgency")}
          name="urgency"
          value={urgency}
          onChange={setUrgency}
          options={[
            { value: "ROUTINE", label: t("patient.care.urgency.ROUTINE") },
            { value: "SOON", label: t("patient.care.urgency.SOON") },
            { value: "URGENT", label: t("patient.care.urgency.URGENT") },
          ]}
        />

        <SubmitBar pending={pending}>{t("patient.care.submit")}</SubmitBar>
      </form>
    </TaskScreen>
  );
}
