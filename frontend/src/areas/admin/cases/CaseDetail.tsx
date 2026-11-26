"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import type { components } from "@/api/schema";
import { FormAlert, Heading } from "@/components/form/fields";
import type { Locale } from "@/i18n/config";
import { numberFormat } from "@/i18n/format";
import type { AdminMessages } from "@/i18n/messages/admin";
import { useMessages } from "@/i18n/provider";

import { useStaffSession } from "../session";
import { AssignDoctorPanel } from "./AssignDoctorPanel";
import { CASE_STATUS_BADGE } from "./CaseQueue";

type CaseDetailData = components["schemas"]["AdminConsultationDetail"];

function formatDateTime(locale: Locale, iso: string): string {
  try {
    return new Intl.DateTimeFormat(locale === "bn" ? "bn-BD" : "en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function CaseDetail({ caseId }: { caseId: string }) {
  const { locale, t } = useMessages<AdminMessages>();
  const { api } = useStaffSession();
  const [caseData, setCaseData] = useState<CaseDetailData | null>(null);
  const [loadStatus, setLoadStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    const controller = new AbortController();
    api
      .GET("/api/v1/admin/doctor-consultations/{id}/", {
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
  }, [api, caseId]);

  if (loadStatus === "loading") {
    return (
      <p role="status" className="text-ink-muted">
        {t("admin.loading")}
      </p>
    );
  }
  if (loadStatus === "error" || !caseData) {
    return (
      <div className="flex flex-col items-start gap-4">
        <FormAlert>{t("admin.error.generic")}</FormAlert>
        <Link href="/admin/cases" className="text-sm font-semibold text-primary underline">
          ← {t("admin.cases.back")}
        </Link>
      </div>
    );
  }

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div>
        <Link href="/admin/cases" className="text-sm font-semibold text-primary underline">
          ← {t("admin.cases.back")}
        </Link>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Heading title={caseData.consultation_code} />
        <div className="flex flex-wrap items-center gap-2">
          {caseData.urgency !== "ROUTINE" && (
            <span className="rounded-control bg-amber-wash px-3 py-1 text-sm font-semibold text-ink">
              {t(`admin.cases.urgency.${caseData.urgency}`)}
            </span>
          )}
          <span
            className={`rounded-control px-3 py-1 text-sm font-semibold ${CASE_STATUS_BADGE[caseData.status]}`}
          >
            {t(`admin.cases.status.${caseData.status}`)}
          </span>
        </div>
      </div>

      <section className="rounded-panel border border-line bg-surface p-5">
        <h2 className="pb-3 text-base font-semibold text-ink">
          {t("admin.cases.patientHeading")}
        </h2>
        <dl className="grid gap-3 text-sm desktop:grid-cols-2">
          <div>
            <dt className="text-ink-muted">{t("admin.cases.patient")}</dt>
            <dd className="font-semibold text-ink">{caseData.patient.full_name}</dd>
          </div>
          <div>
            <dt className="text-ink-muted">{t("admin.cases.phone")}</dt>
            <dd className="font-medium">{caseData.patient.phone}</dd>
          </div>
          <div>
            <dt className="text-ink-muted">{t("admin.cases.area")}</dt>
            <dd className="font-medium">{caseData.patient.area}</dd>
          </div>
          <div>
            <dt className="text-ink-muted">{t("admin.cases.ageGender")}</dt>
            <dd className="font-medium">
              {numberFormat(locale).format(caseData.patient.age)} · {caseData.patient.gender}
            </dd>
          </div>
        </dl>
      </section>

      <section className="flex flex-col gap-3 rounded-panel border border-line bg-surface p-5">
        <h2 className="text-base font-semibold text-ink">{t("admin.cases.caseHeading")}</h2>
        <div>
          <p className="text-xs font-semibold text-ink-muted">{t("admin.cases.complaint")}</p>
          <p className="font-semibold text-ink">{caseData.chief_complaint}</p>
        </div>
        <p className="whitespace-pre-line text-sm text-ink-soft">{caseData.symptoms}</p>
        {caseData.duration_value !== null && caseData.duration_unit && (
          <div>
            <p className="text-xs font-semibold text-ink-muted">{t("admin.cases.duration")}</p>
            <p className="text-sm text-ink-soft">
              {numberFormat(locale).format(caseData.duration_value)} {caseData.duration_unit}
            </p>
          </div>
        )}
        {caseData.symptom_notes && (
          <div>
            <p className="text-xs font-semibold text-ink-muted">
              {t("admin.cases.symptomNotes")}
            </p>
            <p className="whitespace-pre-line text-sm text-ink-soft">
              {caseData.symptom_notes}
            </p>
          </div>
        )}
        <div>
          <p className="text-xs font-semibold text-ink-muted">{t("admin.cases.doctor")}</p>
          <p className="text-sm font-medium text-ink">
            {caseData.doctor
              ? `${caseData.doctor.full_name}${caseData.doctor.doctor_code ? ` (${caseData.doctor.doctor_code})` : ""}`
              : t("admin.cases.unassigned")}
          </p>
        </div>
      </section>

      <AssignDoctorPanel caseData={caseData} onAssigned={setCaseData} />

      <section className="rounded-panel border border-line bg-surface p-5">
        <h2 className="pb-3 text-base font-semibold text-ink">{t("admin.cases.history")}</h2>
        <ul className="flex flex-col gap-2 text-sm">
          {caseData.history.map((item) => (
            <li
              key={item.id}
              className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line pb-2 last:border-b-0 last:pb-0"
            >
              <div>
                <span className="font-semibold">
                  {t(`admin.cases.status.${item.to_status}`)}
                </span>
                {item.actor_name && (
                  <span className="text-ink-muted"> · {item.actor_name}</span>
                )}
                {item.note && <p className="text-xs text-ink-soft">{item.note}</p>}
              </div>
              <span className="text-xs text-ink-muted">
                {formatDateTime(locale, item.created_at)}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
