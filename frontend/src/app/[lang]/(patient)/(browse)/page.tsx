import Link from "next/link";

import { CareNow } from "@/areas/patient/home/CareNow";
import { CommonIllnesses } from "@/areas/patient/home/CommonIllnesses";
import { HomeGreeting } from "@/areas/patient/home/HomeGreeting";
import { IllnessPicker } from "@/areas/patient/home/IllnessPicker";
import { Icon } from "@/components/Icon";
import { common } from "@/i18n/messages/common";
import { patient } from "@/i18n/messages/patient";
import { getTranslator } from "@/i18n/server";

const WARNING_ICON =
  "M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h16.9a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01";

export default async function Home() {
  const { t } = await getTranslator(common, patient);
  return (
    <div className="flex flex-col gap-10 desktop:gap-14">
      <section
        aria-labelledby="home-title"
        className="flex flex-col gap-6 desktop:flex-row desktop:items-start desktop:gap-12"
      >
        <div className="flex flex-col gap-2.5 desktop:flex-1">
          <HomeGreeting />
          <h1
            id="home-title"
            className="font-display text-[38px] leading-[1.1] font-normal text-balance desktop:text-[58px]"
          >
            {t("patient.home.title")}
          </h1>
        </div>

        <div className="flex flex-col gap-4 desktop:flex-1">
          <div className="flex flex-col gap-4 rounded-panel bg-primary-deep px-4.5 py-5.5 text-surface">
            <div className="flex flex-col gap-1.5">
              <h2 className="font-display text-[27px] leading-tight font-normal">
                {t("patient.home.selfCareTitle")}
              </h2>
              <p className="text-base leading-normal text-on-deep-soft">
                {t("patient.home.selfCareNote")}
              </p>
            </div>
            <IllnessPicker />
          </div>
          <div className="flex flex-col gap-3.5 rounded-panel border border-line-strong bg-surface px-4.5 py-5.5">
            <div className="flex flex-col gap-1.5">
              <h2 className="font-display text-[27px] leading-tight font-normal">
                {t("patient.home.doctorTitle")}
              </h2>
              <p className="text-base leading-normal text-ink-soft">
                {t("patient.home.doctorNote")}
              </p>
            </div>
            <Link
              href="/care/new"
              className="inline-flex min-h-13 items-center justify-center rounded-control bg-ink px-5.5 text-[17px] font-bold text-surface desktop:self-start"
            >
              {t("patient.home.doctorCta")}
            </Link>
          </div>
        </div>
      </section>

      <CareNow />

      <CommonIllnesses />

      <aside
        aria-label={t("patient.home.emergencyLabel")}
        className="flex items-start gap-3 rounded-[10px] bg-amber-wash p-4 text-amber"
      >
        <span className="mt-0.5 flex-none">
          <Icon path={WARNING_ICON} strokeWidth={2} />
        </span>
        <p className="text-[15px] leading-relaxed text-amber-ink">
          <strong>{t("patient.home.emergencyTitle")}</strong> {t("patient.home.emergencyNote")}
        </p>
      </aside>

      <footer className="flex flex-col gap-3 border-t border-line-strong pt-5">
        <nav aria-label={t("patient.home.footerNav")} className="flex flex-wrap gap-x-5 gap-y-1.5">
          <Link href="/doctor/signup" className="text-[15px] font-medium text-primary underline">
            {t("patient.home.joinAsDoctor")}
          </Link>
        </nav>
        <span className="text-sm text-ink-muted">{t("patient.home.footerNote")}</span>
      </footer>
    </div>
  );
}
