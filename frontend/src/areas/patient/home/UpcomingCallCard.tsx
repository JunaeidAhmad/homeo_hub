"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import type { components } from "@/api/schema";
import { useSession } from "@/areas/patient/session/SessionProvider";
import { AppointmentSlip } from "@/components/appointments/AppointmentSlip";
import { fill } from "@/i18n/catalog";
import { numberFormat } from "@/i18n/format";
import type { PatientMessages } from "@/i18n/messages/patient";
import { useMessages } from "@/i18n/provider";

type PatientAppointment = components["schemas"]["PatientAppointment"];

const DAY_MS = 24 * 60 * 60 * 1000;

export function UpcomingCallCard() {
  const { locale, t } = useMessages<PatientMessages>();
  const session = useSession();
  const { api } = session;
  const nf = numberFormat(locale);
  const [appointment, setAppointment] = useState<PatientAppointment | null>(null);

  useEffect(() => {
    if (session.status !== "signedIn") return;
    const controller = new AbortController();
    api
      .GET("/api/v1/appointments/upcoming/", { signal: controller.signal })
      .then(({ data }) => {
        if (!data) {
          setAppointment(null);
          return;
        }
        const diffMs = new Date(data.start_at).getTime() - Date.now();
        if (data.status === "IN_PROGRESS" || diffMs <= DAY_MS) {
          setAppointment(data);
        } else {
          setAppointment(null);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setAppointment(null);
      });
    return () => controller.abort();
  }, [api, session.status]);

  if (session.status !== "signedIn" || !appointment) return null;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold text-ink">{t("patient.home.upcomingCall")}</h2>
        <Link
          href={`/care/${appointment.consultation_id}`}
          className="text-sm font-semibold text-primary underline"
        >
          {t("patient.home.openCallCase")}
        </Link>
      </div>
      <Link href={`/care/${appointment.consultation_id}`} className="block hover:opacity-95">
        <AppointmentSlip
          locale={locale}
          startAt={appointment.start_at}
          endAt={appointment.end_at}
          status={appointment.status}
          headerNote={`${appointment.doctor_name} · ${appointment.consultation_code}`}
          labels={{
            duration: fill(t("patient.call.durationMin"), {
              minutes: nf.format(appointment.duration_minutes),
            }),
            statusText: t(`patient.call.status.${appointment.status}`),
            relInHours: t("patient.call.rel.inHours"),
            relInHour: t("patient.call.rel.inHour"),
            relInMinutes: t("patient.call.rel.inMinutes"),
            relInMinute: t("patient.call.rel.inMinute"),
            relNow: t("patient.call.rel.now"),
            relPast: t("patient.call.rel.past"),
          }}
        />
      </Link>
    </section>
  );
}
