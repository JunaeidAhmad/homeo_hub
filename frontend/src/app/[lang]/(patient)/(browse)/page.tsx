import { connection } from "next/server";
import { Suspense } from "react";

import { getApiClient } from "@/api/server";
import { HealthStatus } from "@/components/HealthStatus";
import { common } from "@/i18n/messages/common";
import { patient } from "@/i18n/messages/patient";
import { getTranslator } from "@/i18n/server";
import { getHealth } from "@/lib/health";

async function ApiHealth() {
  await connection(); // checked on every request, never prerendered
  return <HealthStatus health={await getHealth(await getApiClient())} />;
}

export default async function Home() {
  const { t } = await getTranslator(common, patient);
  return (
    <div className="flex flex-col gap-8 desktop:max-w-xl">
      <header className="flex flex-col gap-2">
        <p className="text-base font-medium text-primary">{t("app.tagline")}</p>
        <h1 className="font-display text-[38px] leading-[1.1] font-normal text-balance desktop:text-[58px]">
          {t("patient.home.title")}
        </h1>
      </header>
      <Suspense
        fallback={
          <p role="status" className="text-sm text-ink-muted">
            {t("health.checking")}
          </p>
        }
      >
        <ApiHealth />
      </Suspense>
    </div>
  );
}
