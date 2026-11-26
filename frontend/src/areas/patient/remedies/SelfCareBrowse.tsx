"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useState } from "react";

import type { components } from "@/api/schema";
import { useApiClient } from "@/api/use-api-client";
import type { CommonMessages } from "@/i18n/messages/common";
import type { PatientMessages } from "@/i18n/messages/patient";
import { useMessages } from "@/i18n/provider";

import { RemedyList } from "./RemedyList";
import { SelfCareCard } from "./SelfCareCard";

type Category = components["schemas"]["PublicIllnessCategory"];
type IllnessDetail = components["schemas"]["PublicIllnessDetail"];

/** Illness dropdown with ranked remedies, plus fallback name search when no illness is chosen. */
export function SelfCareBrowse() {
  const { t } = useMessages<CommonMessages & PatientMessages>();
  const api = useApiClient();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const selectId = useId();

  const selectedSlug = searchParams.get("illness") ?? "";

  const [categories, setCategories] = useState<Category[]>([]);
  const [catStatus, setCatStatus] = useState<"loading" | "ready" | "error">("loading");

  const [illnessState, setIllnessState] = useState<{
    slug: string;
    detail: IllnessDetail | null;
    status: "ready" | "error" | "missing";
  } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    api
      .GET("/api/v1/illness-categories/", { signal: controller.signal })
      .then(({ data }) => {
        setCategories(data ?? []);
        setCatStatus(data ? "ready" : "error");
      })
      .catch(() => {
        if (!controller.signal.aborted) setCatStatus("error");
      });
    return () => controller.abort();
  }, [api]);

  useEffect(() => {
    if (!selectedSlug) return;
    const controller = new AbortController();
    api
      .GET("/api/v1/illnesses/{slug}/", {
        params: { path: { slug: selectedSlug } },
        signal: controller.signal,
      })
      .then(({ data, response }) => {
        if (data) {
          setIllnessState({ slug: selectedSlug, detail: data, status: "ready" });
        } else {
          setIllnessState({
            slug: selectedSlug,
            detail: null,
            status: response.status === 404 ? "missing" : "error",
          });
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setIllnessState({ slug: selectedSlug, detail: null, status: "error" });
        }
      });
    return () => controller.abort();
  }, [api, selectedSlug]);

  function selectIllness(slug: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (slug) {
      params.set("illness", slug);
    } else {
      params.delete("illness");
    }
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  const activeIllness =
    selectedSlug && illnessState?.slug === selectedSlug ? illnessState : null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5 desktop:max-w-md">
        <label htmlFor={selectId} className="text-[15px] font-semibold">
          {t("patient.selfcare.illnessLabel")}
        </label>
        <select
          id={selectId}
          value={selectedSlug}
          disabled={catStatus === "loading" && categories.length === 0}
          onChange={(event) => selectIllness(event.target.value)}
          className="min-h-13 rounded-control border border-line-strong bg-surface px-3 text-[17px]"
        >
          <option value="">{t("patient.selfcare.chooseIllness")}</option>
          {categories.map((category) => (
            <optgroup key={category.id} label={category.name}>
              {category.illnesses.map((illness) => (
                <option key={illness.id} value={illness.slug}>
                  {illness.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        {catStatus === "error" && (
          <p role="alert" className="text-sm text-danger">
            {t("table.error")}
          </p>
        )}
      </div>

      {selectedSlug ? (
        !activeIllness ? (
          <p role="status" className="text-ink-muted">
            {t("table.loading")}
          </p>
        ) : activeIllness.status === "missing" ? (
          <p role="status" className="text-ink-muted">
            {t("patient.selfcare.notFound")}
          </p>
        ) : activeIllness.status === "error" || !activeIllness.detail ? (
          <p role="alert" className="text-danger">
            {t("table.error")}
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="rounded-panel border border-line bg-surface p-4 desktop:p-5">
              <p className="text-sm font-semibold text-primary-deep">
                {activeIllness.detail.category_name}
              </p>
              <h2 className="font-display text-2xl font-normal">{activeIllness.detail.name}</h2>
              <p className="mt-1.5 text-base leading-relaxed text-ink-soft">
                {activeIllness.detail.short_description}
              </p>
            </div>

            {activeIllness.detail.remedies.length === 0 ? (
              <p role="status" className="text-ink-muted">
                {t("patient.selfcare.noRemedies")}
              </p>
            ) : (
              <div className="grid gap-3.5 desktop:grid-cols-2">
                {activeIllness.detail.remedies.map((remedy) => (
                  <SelfCareCard
                    key={remedy.id}
                    remedy={remedy}
                    illnessSlug={activeIllness.detail!.slug}
                    illnessId={activeIllness.detail!.id}
                  />
                ))}
              </div>
            )}
          </div>
        )
      ) : (
        <>
          <p className="text-base text-ink-soft">{t("patient.selfcare.prompt")}</p>
          <div className="flex flex-col gap-4 border-t border-line pt-6">
            <h2 className="font-display text-2xl font-normal">
              {t("patient.selfcare.orSearch")}
            </h2>
            <RemedyList />
          </div>
        </>
      )}
    </div>
  );
}
