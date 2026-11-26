"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

import type { components } from "@/api/schema";
import { RemedyVial } from "@/components/RemedyVial";
import type { PatientMessages } from "@/i18n/messages/patient";
import { useMessages } from "@/i18n/provider";

import {
  DEFAULT_POTENCIES,
  initialChoice,
  RemedyChoice,
  type RemedyChoiceValue,
} from "./RemedyChoice";

type RankedRemedy = components["schemas"]["RankedRemedyCard"];

/** Ranked remedy card on the self-care page: picture/vial, pickers, price, and Add to cart. */
export function SelfCareCard({
  remedy,
  illnessSlug,
}: {
  remedy: RankedRemedy;
  illnessSlug: string;
}) {
  const { t } = useMessages<PatientMessages>();
  const [choice, setChoice] = useState<RemedyChoiceValue>(() =>
    initialChoice(DEFAULT_POTENCIES, remedy.prices),
  );

  const query = new URLSearchParams({ illness: illnessSlug, potency: choice.potency });
  if (choice.form) query.set("form", choice.form);
  const href = `/remedies/${remedy.slug}?${query.toString()}`;

  return (
    <article className="flex flex-col gap-3.5 rounded-panel border border-line bg-surface p-4">
      <div className="flex gap-3.5">
        <Link
          href={href}
          className="flex h-24 w-18 flex-none items-center justify-center overflow-hidden rounded-control bg-mist"
        >
          {remedy.picture_url ? (
            <Image
              unoptimized
              src={remedy.picture_url}
              alt=""
              width={72}
              height={96}
              className="size-full object-contain"
            />
          ) : (
            <RemedyVial name={remedy.name} size="small" form={choice.form} />
          )}
        </Link>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <Link href={href} className="hover:underline">
            <span lang="la" className="font-display text-xl leading-tight italic">
              {remedy.name}
            </span>
          </Link>
          {remedy.name_bn && (
            <span lang="bn" className="text-sm text-ink-muted">
              {remedy.name_bn}
            </span>
          )}
          <p className="mt-1 line-clamp-2 text-[15px] leading-snug text-ink-soft">
            {remedy.indication}
          </p>
        </div>
      </div>

      <div className="border-t border-line pt-3">
        <RemedyChoice prices={remedy.prices} compact onChange={setChoice} />
      </div>

      <button
        type="button"
        disabled
        className="mt-auto min-h-13 w-full cursor-not-allowed rounded-control bg-primary px-5 font-bold text-surface opacity-60"
      >
        {choice.price !== null ? t("patient.remedy.addToCart") : t("patient.remedy.unavailable")}
      </button>
    </article>
  );
}
