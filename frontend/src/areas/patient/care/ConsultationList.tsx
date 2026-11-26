"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import type { components } from "@/api/schema";
import { RemedyVial } from "@/components/RemedyVial";
import { FormAlert } from "@/components/form/fields";
import { useSession } from "@/areas/patient/session/SessionProvider";
import type { Locale } from "@/i18n/config";
import type { PatientMessages } from "@/i18n/messages/patient";
import { useMessages } from "@/i18n/provider";

import { CONSULTATION_STATUS_META, URGENCY_BADGE } from "./status";

type Summary = components["schemas"]["PatientConsultationSummary"];

function formatDate(locale: Locale, iso: string): string {
  try {
    return new Intl.DateTimeFormat(locale === "bn" ? "bn-BD" : "en-US", {
      dateStyle: "medium",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function ConsultationList() {
  const { locale, t } = useMessages<PatientMessages>();
  const session = useSession();
  const { api } = session;
  const [cases, setCases] = useState<Summary[] | null>(null);
  const [failed, setFailed] = useState(false);

  const isGuest =
    session.status === "signedOut" || (session.status === "unavailable" && !session.hasSession);

  useEffect(() => {
    if (session.status !== "signedIn") return;
    const controller = new AbortController();
    api
      .GET("/api/v1/consultations/", { signal: controller.signal })
      .then(({ data }) => {
        if (data) {
          setCases(data);
          setFailed(false);
        } else {
          setFailed(true);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => controller.abort();
  }, [api, session.status]);

  if (isGuest) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-panel border border-line bg-surface p-6 text-center">
        <p className="text-base text-ink-soft">{t("patient.care.guest")}</p>
        <Link
          href="/signin?next=/care"
          className="inline-flex min-h-13 items-center justify-center rounded-control bg-primary px-6 font-bold text-surface"
        >
          {t("patient.cart.signIn")}
        </Link>
      </div>
    );
  }

  if (session.status !== "signedIn" || (cases === null && !failed)) {
    return (
      <p role="status" className="text-ink-muted">
        …
      </p>
    );
  }

  if (failed) {
    return <FormAlert>{t("patient.error.generic")}</FormAlert>;
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link
          href="/care/new"
          className="inline-flex min-h-13 items-center justify-center rounded-control bg-primary px-5 text-base font-bold text-surface"
        >
          {t("patient.care.start")}
        </Link>
      </div>

      {cases && cases.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-panel border border-line bg-surface px-6 py-10 text-center">
          <RemedyVial name="HomeoHub" size="small" />
          <div className="flex flex-col gap-1">
            <p className="font-display text-xl text-ink">{t("patient.care.empty")}</p>
            <p className="text-sm text-ink-muted">{t("patient.care.emptyNote")}</p>
          </div>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {cases?.map((item) => {
            const meta = CONSULTATION_STATUS_META[item.status];
            return (
              <li key={item.id}>
                <Link
                  href={`/care/${item.id}`}
                  className="flex flex-col gap-2 rounded-panel border border-line bg-surface p-4 hover:border-line-strong"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-display text-lg text-ink">
                      {item.consultation_code}
                    </span>
                    <div className="flex flex-wrap items-center gap-2">
                      {item.urgency !== "ROUTINE" && (
                        <span
                          className={`rounded-control px-2.5 py-0.5 text-xs font-semibold ${URGENCY_BADGE[item.urgency]}`}
                        >
                          {t(`patient.care.urgency.${item.urgency}`)}
                        </span>
                      )}
                      <span
                        className={`rounded-control px-2.5 py-0.5 text-xs font-semibold ${meta.badgeClass}`}
                      >
                        {t(meta.labelKey)}
                      </span>
                    </div>
                  </div>
                  <p className="font-semibold text-ink">{item.chief_complaint}</p>
                  <div className="flex flex-wrap justify-between gap-2 text-xs text-ink-muted">
                    <span>
                      {item.doctor_name ? item.doctor_name : t("patient.care.unassigned")}
                    </span>
                    <span>{formatDate(locale, item.submitted_at)}</span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
