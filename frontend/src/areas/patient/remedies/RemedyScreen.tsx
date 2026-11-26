import { notFound } from "next/navigation";
import { connection } from "next/server";

import { getApiClient } from "@/api/server";
import { TaskScreen } from "@/areas/patient/TaskScreen";
import { common } from "@/i18n/messages/common";
import { patient } from "@/i18n/messages/patient";
import { getTranslator } from "@/i18n/server";

import { RemedyView } from "./RemedyView";

async function fetchRemedy(slug: string) {
  const api = await getApiClient();
  try {
    const { data, response } = await api.GET("/api/v1/remedies/{slug}/", {
      params: { path: { slug } },
      cache: "no-store", // an archived remedy must disappear at once
    });
    return { remedy: data, missing: response.status === 404 };
  } catch {
    return { remedy: undefined, missing: false };
  }
}

/** One remedy, fetched on each visit in the page's language. */
export async function RemedyScreen({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ illness?: string }>;
}) {
  await connection();
  const [{ slug }, query] = await Promise.all([
    params,
    searchParams ?? Promise.resolve<{ illness?: string }>({}),
  ]);
  const illness = query.illness?.trim() || undefined;
  const backHref = illness ? `/remedies?illness=${encodeURIComponent(illness)}` : "/remedies";
  const { t } = await getTranslator(common, patient);
  const { remedy, missing } = await fetchRemedy(slug);
  if (missing) notFound();

  return (
    <TaskScreen title={remedy?.name ?? t("patient.remedy.heading")} backHref={backHref}>
      {remedy ? (
        <RemedyView remedy={remedy} illnessSlug={illness} t={t} />
      ) : (
        <p role="alert" className="text-danger">
          {t("patient.remedy.failed")}
        </p>
      )}
    </TaskScreen>
  );
}
