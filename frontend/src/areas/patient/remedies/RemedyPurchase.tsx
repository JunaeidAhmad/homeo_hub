"use client";

import Image from "next/image";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, type ReactNode } from "react";

import type { components } from "@/api/schema";
import { ActionBar } from "@/areas/patient/ActionBar";
import { RemedyVial } from "@/components/RemedyVial";
import { formatMoney } from "@/i18n/format";
import type { PatientMessages } from "@/i18n/messages/patient";
import { useMessages } from "@/i18n/provider";

import { initialChoice, RemedyChoice, type RemedyChoiceValue } from "./RemedyChoice";

type Remedy = components["schemas"]["RemedyDetail"];

/** Client purchase wrapper for the remedy detail page: pickers, amber/clear vial, and pinned bar. */
export function RemedyPurchase({
  remedy,
  illnessSlug,
  children,
}: {
  remedy: Remedy;
  illnessSlug?: string;
  children: ReactNode;
}) {
  const { locale, t } = useMessages<PatientMessages>();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const requestedPotency = searchParams.get("potency");
  const requestedForm = searchParams.get("form");
  const activeIllness = illnessSlug || searchParams.get("illness") || undefined;
  void activeIllness; // ticket 09 attaches illness to cart items

  const [choice, setChoice] = useState<RemedyChoiceValue>(() =>
    initialChoice(remedy.potencies, remedy.prices, requestedPotency, requestedForm),
  );

  function handleChange(next: RemedyChoiceValue) {
    setChoice(next);
    const params = new URLSearchParams(searchParams.toString());
    params.set("potency", next.potency);
    if (next.form) {
      params.set("form", next.form);
    } else {
      params.delete("form");
    }
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  return (
    <article className="flex flex-col gap-6">
      <div className="-mx-4 -mt-6 flex flex-col bg-surface desktop:mx-0 desktop:mt-0 desktop:flex-row desktop:overflow-hidden desktop:rounded-panel desktop:border desktop:border-line">
        <div className="flex items-center justify-center bg-mist px-4 py-7 desktop:flex-1">
          {remedy.picture_url ? (
            <Image
              unoptimized
              src={remedy.picture_url}
              alt={remedy.name}
              width={600}
              height={600}
              className="h-auto max-h-96 w-full object-contain"
            />
          ) : (
            <RemedyVial name={remedy.name} nameBn={remedy.name_bn} form={choice.form} />
          )}
        </div>
        <div className="flex flex-col gap-4 px-4 py-6 desktop:flex-1 desktop:p-9">
          <div className="flex flex-col gap-1">
            <h1
              lang="la"
              className="font-display text-[38px] leading-tight font-normal italic desktop:text-[52px]"
            >
              {remedy.name}
            </h1>
            {remedy.name_bn && (
              <span lang="bn" className="font-display text-[19px] text-ink-muted">
                {remedy.name_bn}
              </span>
            )}
          </div>
          <p className="text-base leading-relaxed whitespace-pre-line text-ink-soft">
            {remedy.indication}
          </p>
          <div className="mt-auto border-t border-line pt-4">
            <RemedyChoice
              potencies={remedy.potencies}
              prices={remedy.prices}
              initialPotency={requestedPotency}
              initialForm={requestedForm}
              onChange={handleChange}
            />
          </div>
        </div>
      </div>

      {children}

      <ActionBar>
        {choice.price !== null && choice.form ? (
          <div className="flex items-center justify-between gap-3">
            <div className="flex flex-col">
              <span className="font-display text-2xl leading-none font-normal">
                {formatMoney(locale, choice.price)}
              </span>
              <span className="text-sm text-ink-muted">
                {choice.potency} · {t(`patient.remedy.form.${choice.form}`)}
              </span>
            </div>
            <button
              type="button"
              disabled
              className="min-h-[54px] flex-1 cursor-not-allowed rounded-control bg-primary px-5 text-[17px] font-bold text-surface opacity-60 desktop:max-w-xs"
            >
              {t("patient.remedy.addToCart")}
            </button>
          </div>
        ) : (
          <p className="py-2 text-center font-semibold text-ink-muted">
            {t("patient.remedy.unavailable")}
          </p>
        )}
      </ActionBar>
    </article>
  );
}
