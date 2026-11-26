"use client";

import { Heading } from "@/components/form/fields";
import { RemedyVial } from "@/components/RemedyVial";
import { fill } from "@/i18n/catalog";
import type { DoctorMessages } from "@/i18n/messages/doctor";
import { useMessages } from "@/i18n/provider";

import { useDoctorSession } from "./session";

export function DoctorQueueEmpty() {
  const { t } = useMessages<DoctorMessages>();
  const session = useDoctorSession();

  const name = session.status === "signedIn" ? session.doctor.full_name : "";

  return (
    <div className="flex max-w-xl flex-col gap-6">
      <Heading
        title={t("doctor.queue.title")}
        note={name ? fill(t("doctor.queue.greeting"), { name }) : undefined}
      />
      <div className="flex flex-col items-center gap-4 rounded-panel border border-line bg-surface px-6 py-10 text-center">
        <RemedyVial name="HomeoHub" size="small" />
        <div className="flex flex-col gap-1">
          <p className="font-display text-xl text-ink">{t("doctor.queue.empty")}</p>
          <p className="text-sm text-ink-muted">{t("doctor.queue.emptyNote")}</p>
        </div>
      </div>
    </div>
  );
}
