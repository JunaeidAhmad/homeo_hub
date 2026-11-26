"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import type { components } from "@/api/schema";
import { FormAlert, Heading } from "@/components/form/fields";
import { fill } from "@/i18n/catalog";
import type { Locale } from "@/i18n/config";
import { numberFormat } from "@/i18n/format";
import type { DoctorMessages } from "@/i18n/messages/doctor";
import { useMessages } from "@/i18n/provider";

import { DOCTOR_STATUS_BADGE } from "./DoctorQueue";
import { PrescriptionEditor } from "./PrescriptionEditor";
import { QuestionsPanel } from "./QuestionsPanel";
import { VideoCallTab } from "./VideoCallTab";
import { useDoctorSession } from "./session";

type CaseDetail = components["schemas"]["DoctorConsultationDetail"];
type MobileTab = "case" | "questions" | "call" | "prescription";
type RightTab = "questions" | "call" | "prescription";

function formatDate(locale: Locale, iso: string): string {
  try {
    return new Intl.DateTimeFormat(locale === "bn" ? "bn-BD" : "en-US", {
      dateStyle: "medium",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function ProfileSection({
  title,
  defaultOpen = false,
  entries,
  emptyLabel,
}: {
  title: string;
  defaultOpen?: boolean;
  entries: { label: string; value: string | null | undefined }[];
  emptyLabel: string;
}) {
  const nonEmpty = entries.filter((item) => Boolean(item.value && item.value.trim()));
  return (
    <details open={defaultOpen} className="rounded-control border border-line bg-surface px-4 py-3">
      <summary className="cursor-pointer list-none font-semibold text-ink">
        <div className="flex items-center justify-between gap-2">
          <span>{title}</span>
          <span className="text-xs font-normal text-ink-muted">
            {nonEmpty.length === 0 ? emptyLabel : `${nonEmpty.length}`}
          </span>
        </div>
      </summary>
      {nonEmpty.length === 0 ? (
        <p className="pt-2 text-sm text-ink-muted">{emptyLabel}</p>
      ) : (
        <dl className="flex flex-col gap-2 pt-3 text-sm">
          {nonEmpty.map((item) => (
            <div key={item.label}>
              <dt className="text-xs font-semibold text-ink-muted">{item.label}</dt>
              <dd className="whitespace-pre-line text-ink-soft">{item.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </details>
  );
}

export function CaseWorkspace({ caseId }: { caseId: string }) {
  const { locale, t } = useMessages<DoctorMessages>();
  const { api } = useDoctorSession();

  const [caseData, setCaseData] = useState<CaseDetail | null>(null);
  const [loadStatus, setLoadStatus] = useState<"loading" | "ready" | "error">("loading");
  const [mobileTab, setMobileTab] = useState<MobileTab>("case");
  const [rightTab, setRightTab] = useState<RightTab>("questions");
  const openedRef = useRef<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    api
      .GET("/api/v1/doctor/consultations/{id}/", {
        params: { path: { id: caseId } },
        signal: controller.signal,
      })
      .then(({ data }) => {
        if (!data) {
          setLoadStatus("error");
          return;
        }
        setCaseData(data);
        setLoadStatus("ready");
        if (data.status === "ASSIGNED" && openedRef.current !== caseId) {
          openedRef.current = caseId;
          void api
            .POST("/api/v1/doctor/consultations/{id}/open/", {
              params: { path: { id: caseId } },
            })
            .then((opened) => {
              if (opened.data) setCaseData(opened.data);
            });
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoadStatus("error");
      });
    return () => controller.abort();
  }, [api, caseId]);

  if (loadStatus === "loading") {
    return (
      <p role="status" className="text-ink-muted">
        {t("doctor.loading")}
      </p>
    );
  }
  if (loadStatus === "error" || !caseData) {
    return (
      <div className="flex flex-col items-start gap-4">
        <FormAlert>{t("doctor.case.notFound")}</FormAlert>
        <Link href="/doctor" className="text-sm font-semibold text-primary underline">
          ← {t("doctor.case.back")}
        </Link>
      </div>
    );
  }

  const { patient } = caseData;
  const initial = patient.full_name.trim().charAt(0).toUpperCase() || "?";

  const caseColumn = (
    <div className="flex flex-col gap-5">
      {/* Patient banner */}
      <section className="flex flex-wrap items-center gap-4 rounded-panel border border-line bg-surface p-4">
        {patient.picture_url ? (
          <Image
            unoptimized
            src={patient.picture_url}
            alt={patient.full_name}
            width={64}
            height={64}
            className="size-16 rounded-full border border-line object-cover"
          />
        ) : (
          <div
            aria-hidden="true"
            className="flex size-16 items-center justify-center rounded-full border border-line bg-mist font-display text-xl text-primary-deep"
          >
            {initial}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold text-ink">{patient.full_name}</h2>
          <p className="text-sm text-ink-soft">
            {fill(t("doctor.queue.ageValue"), {
              age: numberFormat(locale).format(patient.age),
            })}{" "}
            · {t(`doctor.profile.gender.${patient.gender}`)} · {patient.location.display_name}
          </p>
        </div>
      </section>

      {/* Case complaint */}
      <section className="flex flex-col gap-3 rounded-panel border border-line bg-surface p-4">
        <div>
          <p className="text-xs font-semibold text-ink-muted">{t("doctor.case.complaint")}</p>
          <p className="text-base font-semibold text-ink">{caseData.chief_complaint}</p>
        </div>
        {caseData.illness && (
          <div>
            <p className="text-xs font-semibold text-ink-muted">{t("doctor.case.illness")}</p>
            <p className="text-sm text-ink-soft">{caseData.illness.name}</p>
          </div>
        )}
        {caseData.categories.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-ink-muted">{t("doctor.case.categories")}</p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {caseData.categories.map((cat) => (
                <span
                  key={cat.id}
                  className="rounded-control border border-line bg-mist px-2.5 py-0.5 text-xs font-semibold text-ink"
                >
                  {cat.name}
                </span>
              ))}
            </div>
          </div>
        )}
        <div>
          <p className="text-xs font-semibold text-ink-muted">{t("doctor.case.symptoms")}</p>
          <p className="whitespace-pre-line text-sm text-ink-soft">{caseData.symptoms}</p>
        </div>
        {caseData.duration_value !== null && caseData.duration_unit && (
          <div>
            <p className="text-xs font-semibold text-ink-muted">{t("doctor.case.duration")}</p>
            <p className="text-sm text-ink-soft">
              {numberFormat(locale).format(caseData.duration_value)}{" "}
              {t(`doctor.case.durationUnit.${caseData.duration_unit}`)}
            </p>
          </div>
        )}
        {caseData.symptom_notes && (
          <div>
            <p className="text-xs font-semibold text-ink-muted">
              {t("doctor.case.symptomNotes")}
            </p>
            <p className="whitespace-pre-line text-sm text-ink-soft">
              {caseData.symptom_notes}
            </p>
          </div>
        )}
      </section>

      {/* Read-only clinical profile */}
      <section className="flex flex-col gap-2">
        <h2 className="text-base font-semibold text-ink">{t("doctor.case.profileSections")}</h2>
        <ProfileSection
          title={t("doctor.case.section.basic")}
          defaultOpen
          emptyLabel={t("doctor.case.sectionEmpty")}
          entries={[
            { label: t("doctor.profile.bloodGroup"), value: patient.blood_group },
            {
              label: t("doctor.profile.heightCm"),
              value: patient.height_cm !== null ? `${patient.height_cm} cm` : "",
            },
            {
              label: t("doctor.profile.weightKg"),
              value: patient.weight_kg ? `${patient.weight_kg} kg` : "",
            },
            { label: t("doctor.profile.maritalStatus"), value: patient.marital_status },
            { label: t("doctor.profile.occupation"), value: patient.occupation },
          ]}
        />
        <ProfileSection
          title={t("doctor.case.section.family_history")}
          emptyLabel={t("doctor.case.sectionEmpty")}
          entries={[
            { label: t("doctor.profile.familyConditions"), value: patient.family_conditions },
            { label: t("doctor.profile.familyNotes"), value: patient.family_notes },
          ]}
        />
        <ProfileSection
          title={t("doctor.case.section.medical_history")}
          emptyLabel={t("doctor.case.sectionEmpty")}
          entries={[
            { label: t("doctor.profile.chronicConditions"), value: patient.chronic_conditions },
            { label: t("doctor.profile.currentMedications"), value: patient.current_medications },
            { label: t("doctor.profile.allergies"), value: patient.allergies },
          ]}
        />
        <ProfileSection
          title={t("doctor.case.section.mental_picture")}
          emptyLabel={t("doctor.case.sectionEmpty")}
          entries={[
            { label: t("doctor.profile.temperament"), value: patient.temperament },
            { label: t("doctor.profile.fearsAnxieties"), value: patient.fears_anxieties },
            { label: t("doctor.profile.emotionalNotes"), value: patient.emotional_notes },
          ]}
        />
        <ProfileSection
          title={t("doctor.case.section.general_picture")}
          emptyLabel={t("doctor.case.sectionEmpty")}
          entries={[
            { label: t("doctor.profile.thermalPreference"), value: patient.thermal_preference },
            { label: t("doctor.profile.appetiteThirst"), value: patient.appetite_thirst },
            { label: t("doctor.profile.sleepDreams"), value: patient.sleep_dreams },
            { label: t("doctor.profile.generalNotes"), value: patient.general_notes },
          ]}
        />
        <ProfileSection
          title={t("doctor.case.section.likes_dislikes")}
          emptyLabel={t("doctor.case.sectionEmpty")}
          entries={[
            { label: t("doctor.profile.foodCravings"), value: patient.food_cravings },
            { label: t("doctor.profile.foodAversions"), value: patient.food_aversions },
            { label: t("doctor.profile.weatherModalities"), value: patient.weather_modalities },
          ]}
        />
      </section>

      {/* Past cases with this doctor */}
      <section className="flex flex-col gap-2 rounded-panel border border-line bg-surface p-4">
        <h2 className="text-base font-semibold text-ink">{t("doctor.case.pastWithYou")}</h2>
        {caseData.patient_history.length === 0 ? (
          <p className="text-sm text-ink-muted">{t("doctor.case.noPastCases")}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {caseData.patient_history.map((prev) => (
              <li key={prev.id} className="py-2 first:pt-0 last:pb-0">
                <Link
                  href={`/doctor/cases/${prev.id}`}
                  className="flex flex-wrap items-center justify-between gap-2 text-sm hover:underline"
                >
                  <span className="font-semibold text-primary">
                    {prev.consultation_code} · {prev.chief_complaint}
                  </span>
                  <span className="text-xs text-ink-muted">
                    {formatDate(locale, prev.submitted_at)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );

  const questionsPanel = (
    <QuestionsPanel
      caseId={caseData.id}
      caseStatus={caseData.status}
      categories={caseData.categories}
      questionSets={caseData.question_sets}
      onSent={(created) =>
        setCaseData((now) =>
          now
            ? {
                ...now,
                status: "AWAITING_PATIENT",
                question_sets: [...now.question_sets, created],
              }
            : now,
        )
      }
    />
  );

  const prescriptionPanel = (
    <PrescriptionEditor
      caseId={caseData.id}
      caseStatus={caseData.status}
      onStatusChange={(nextStatus) =>
        setCaseData((now) => (now ? { ...now, status: nextStatus } : now))
      }
    />
  );

  const callPanel = <VideoCallTab caseId={caseData.id} caseStatus={caseData.status} />;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link href="/doctor" className="text-sm font-semibold text-primary underline">
          ← {t("doctor.case.back")}
        </Link>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Heading title={caseData.consultation_code} />
        <span
          className={`rounded-control px-3 py-1 text-sm font-semibold ${DOCTOR_STATUS_BADGE[caseData.status]}`}
        >
          {t(`doctor.queue.status.${caseData.status}`)}
        </span>
      </div>

      {/* Mobile tab switcher */}
      <div className="grid grid-cols-2 gap-2 desktop:hidden">
        {(["case", "questions", "call", "prescription"] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            aria-pressed={mobileTab === tab}
            onClick={() => setMobileTab(tab)}
            className={`min-h-10 rounded-control px-3 text-sm font-semibold ${
              mobileTab === tab
                ? "bg-primary text-surface"
                : "border border-line-strong bg-surface text-ink-soft"
            }`}
          >
            {t(`doctor.case.tab.${tab}`)}
          </button>
        ))}
      </div>

      <div className="desktop:hidden">
        {mobileTab === "case" && caseColumn}
        {mobileTab === "questions" && questionsPanel}
        {mobileTab === "call" && callPanel}
        {mobileTab === "prescription" && prescriptionPanel}
      </div>

      {/* Desktop 2-column workspace */}
      <div className="hidden gap-6 desktop:grid desktop:grid-cols-[minmax(0,1fr)_400px]">
        <div>{caseColumn}</div>
        <aside className="flex flex-col gap-4">
          <div className="flex gap-2">
            {(["questions", "call", "prescription"] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                aria-pressed={rightTab === tab}
                onClick={() => setRightTab(tab)}
                className={`min-h-10 flex-1 rounded-control px-2.5 text-sm font-semibold ${
                  rightTab === tab
                    ? "bg-primary text-surface"
                    : "border border-line-strong bg-surface text-ink-soft"
                }`}
              >
                {t(`doctor.case.tab.${tab}`)}
              </button>
            ))}
          </div>
          {rightTab === "questions"
            ? questionsPanel
            : rightTab === "call"
              ? callPanel
              : prescriptionPanel}
        </aside>
      </div>
    </div>
  );
}
