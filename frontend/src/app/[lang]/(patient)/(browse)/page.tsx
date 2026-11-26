import Link from "next/link";

import { UpcomingCallCard } from "@/areas/patient/home/UpcomingCallCard";
import { common } from "@/i18n/messages/common";
import { patient } from "@/i18n/messages/patient";
import { getTranslator } from "@/i18n/server";

export default async function Home() {
  const { t } = await getTranslator(common, patient);
  return (
    <div className="flex flex-col gap-8 desktop:max-w-3xl">
      <header className="flex flex-col gap-2">
        <p className="text-base font-medium text-primary">{t("app.tagline")}</p>
        <h1 className="font-display text-[38px] leading-[1.1] font-normal text-balance desktop:text-[54px]">
          {t("patient.home.title")}
        </h1>
      </header>

      <UpcomingCallCard />

      <div className="grid gap-4 desktop:grid-cols-2">
        <article className="flex flex-col justify-between gap-4 rounded-panel border border-line bg-surface p-6">
          <div className="flex flex-col gap-2">
            <h2 className="font-display text-2xl text-ink">
              {t("patient.home.selfCareTitle")}
            </h2>
            <p className="text-base text-ink-soft">{t("patient.home.selfCareNote")}</p>
          </div>
          <Link
            href="/remedies"
            className="inline-flex min-h-13 items-center justify-center rounded-control border border-line-strong bg-surface px-5 text-base font-semibold text-ink hover:bg-mist/60"
          >
            {t("patient.home.selfCareCta")}
          </Link>
        </article>

        <article className="flex flex-col justify-between gap-4 rounded-panel border border-primary/40 bg-mist p-6">
          <div className="flex flex-col gap-2">
            <h2 className="font-display text-2xl text-primary-deep">
              {t("patient.home.doctorTitle")}
            </h2>
            <p className="text-base text-ink-soft">{t("patient.home.doctorNote")}</p>
          </div>
          <div className="flex flex-col gap-2">
            <Link
              href="/care/new"
              className="inline-flex min-h-13 items-center justify-center rounded-control bg-primary px-5 text-base font-bold text-surface"
            >
              {t("patient.home.doctorCta")}
            </Link>
            <Link
              href="/care"
              className="text-center text-sm font-semibold text-primary underline"
            >
              {t("patient.home.myCareLink")}
            </Link>
          </div>
        </article>
      </div>
    </div>
  );
}
