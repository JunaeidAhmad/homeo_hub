import { Suspense } from "react";

import { RemedyScreen } from "@/areas/patient/remedies/RemedyScreen";
import { patient } from "@/i18n/messages/patient";
import { common } from "@/i18n/messages/common";
import { getTranslator } from "@/i18n/server";

export default async function Page({
  params,
  searchParams,
}: PageProps<"/[lang]/remedies/[slug]">) {
  const { t } = await getTranslator(common, patient);
  return (
    <Suspense
      fallback={
        <p role="status" className="p-6 text-ink-muted">
          {t("patient.remedy.loading")}
        </p>
      }
    >
      <RemedyScreen params={params} searchParams={searchParams} />
    </Suspense>
  );
}
