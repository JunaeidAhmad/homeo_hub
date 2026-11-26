"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import type { components } from "@/api/schema";
import { TaskScreen } from "@/areas/patient/TaskScreen";
import { useSession } from "@/areas/patient/session/SessionProvider";
import { FormAlert } from "@/components/form/fields";
import { PrescriptionSheet } from "@/components/prescription/PrescriptionSheet";
import { SealedSheet } from "@/components/prescription/SealedSheet";
import type { PrescriptionSheetData } from "@/components/prescription/types";
import { fill } from "@/i18n/catalog";
import { formatMoney, numberFormat } from "@/i18n/format";
import type { PatientMessages } from "@/i18n/messages/patient";
import { useMessages } from "@/i18n/provider";

type PatientPrescriptionResponse = components["schemas"]["PatientPrescriptionResponse"];

export function PrescriptionPage({ caseId }: { caseId: string }) {
  const { locale, t } = useMessages<PatientMessages>();
  const session = useSession();
  const { api } = session;
  const nf = numberFormat(locale);

  const [data, setData] = useState<PatientPrescriptionResponse | null>(null);
  const [loadStatus, setLoadStatus] = useState<"loading" | "ready" | "error">("loading");

  const isGuest =
    session.status === "signedOut" || (session.status === "unavailable" && !session.hasSession);

  useEffect(() => {
    if (session.status !== "signedIn") return;
    const controller = new AbortController();
    api
      .GET("/api/v1/doctor-consultations/{id}/prescription/", {
        params: { path: { id: caseId } },
        signal: controller.signal,
      })
      .then(({ data: payload }) => {
        if (payload) {
          setData(payload);
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
      <TaskScreen title={t("patient.rx.title")} backHref={`/care/${caseId}`}>
        <div className="flex flex-col items-center gap-4 rounded-panel border border-line bg-surface p-6 text-center">
          <p className="text-base text-ink-soft">{t("patient.care.guest")}</p>
          <Link
            href={`/signin?next=/care/${caseId}/prescription`}
            className="flex min-h-13 items-center justify-center rounded-control bg-primary px-6 font-bold text-surface"
          >
            {t("patient.cart.signIn")}
          </Link>
        </div>
      </TaskScreen>
    );
  }

  if (loadStatus === "loading" || !data) {
    return (
      <TaskScreen title={t("patient.rx.title")} backHref={`/care/${caseId}`}>
        {loadStatus === "error" ? (
          <FormAlert>{t("patient.rx.notFound")}</FormAlert>
        ) : (
          <p role="status" className="text-ink-muted">
            …
          </p>
        )}
      </TaskScreen>
    );
  }

  if (data.locked || "summary" in data) {
    const lockedData = "summary" in data ? data : null;
    if (!lockedData) return null;
    const payAction = (
      <button
        type="button"
        disabled
        className="flex min-h-[54px] w-full items-center justify-center rounded-control bg-primary px-5 text-[17px] font-bold text-surface disabled:opacity-50"
      >
        {fill(t("patient.rx.payToOpen"), {
          total: formatMoney(locale, lockedData.invoice.total_poisha),
        })}
      </button>
    );

    return (
      <TaskScreen title={t("patient.rx.title")} backHref={`/care/${caseId}`} action={payAction}>
        <SealedSheet
          summary={lockedData.summary}
          invoice={lockedData.invoice}
          locale={locale}
          labels={{
            sealedNotice: t("patient.rx.sealedNotice"),
            remedyCount: (count) =>
              fill(t("patient.rx.remedyCount"), { count: nf.format(count) }),
            doctorFee: t("patient.rx.doctorFee"),
            platformFee: t("patient.rx.platformFee"),
            total: t("patient.rx.total"),
          }}
        />
      </TaskScreen>
    );
  }

  const rx = data.prescription;
  const sheetData: PrescriptionSheetData = {
    doctor: rx.doctor,
    version: rx.version,
    issued_at: rx.issued_at,
    report_after_date: rx.report_after_date,
    items: rx.items.map((item) => ({
      id: item.id,
      remedy_name: item.remedy_name,
      remedy_name_bn: item.remedy_name_bn,
      is_catalog: item.is_catalog,
      potency: item.potency,
      form: item.form,
      dosage: item.dosage,
      frequency: item.frequency,
      duration: item.duration,
      unavailable_reason: item.unavailable_reason,
    })),
    advice: rx.advice,
  };

  return (
    <TaskScreen title={t("patient.rx.title")} backHref={`/care/${caseId}`}>
      <PrescriptionSheet
        prescription={sheetData}
        locale={locale}
        labels={{
          formLabel: {
            PILL: t("patient.remedy.form.PILL"),
            LIQUID: t("patient.remedy.form.LIQUID"),
          },
          notSoldHere: t("patient.rx.notSoldHere"),
          currentlyUnavailable: t("patient.rx.currentlyUnavailable"),
          doTitle: t("patient.remedy.do"),
          dontTitle: t("patient.remedy.dont"),
          reportAfter: (date) => fill(t("patient.rx.reportAfter"), { date }),
          versionLabel: (version) =>
            fill(t("patient.rx.versionLabel"), { version: nf.format(version) }),
          regNoPrefix: t("patient.rx.regNoPrefix"),
          signatureLabel: t("patient.rx.signatureLabel"),
        }}
      />
    </TaskScreen>
  );
}
