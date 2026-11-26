"use client";

import Link from "next/link";
import { useState } from "react";

import { fill } from "@/i18n/catalog";
import { numberFormat } from "@/i18n/format";
import type { CommonMessages } from "@/i18n/messages/common";
import type { PatientMessages } from "@/i18n/messages/patient";
import { useMessages } from "@/i18n/provider";

import { useIllnessCategories } from "./use-illness-categories";

/** How many illness tiles the home page shows before "See all". */
const TILE_LIMIT = 8;
const ALL = "all";

/** Home's "Common illnesses": category chips over a grid of illness tiles. */
export function CommonIllnesses() {
  const { locale, t } = useMessages<CommonMessages & PatientMessages>();
  const { status, categories } = useIllnessCategories();
  const [picked, setPicked] = useState(ALL);
  const nf = numberFormat(locale);

  if (status === "error") return null;

  const shown = categories.filter((category) => picked === ALL || category.id === picked);
  const tiles = shown.flatMap((category) => category.illnesses).slice(0, TILE_LIMIT);
  const chips = [{ id: ALL, name: t("patient.home.allCategories") }, ...categories];

  return (
    <section aria-labelledby="home-illnesses" className="flex flex-col gap-3.5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="home-illnesses" className="font-display text-[26px] font-normal">
          {t("patient.home.commonIllnesses")}
        </h2>
        <Link href="/remedies" className="text-[15px] font-semibold text-primary underline">
          {t("patient.home.seeAll")}
        </Link>
      </div>

      {status === "loading" ? (
        <p role="status" className="text-ink-muted">
          {t("table.loading")}
        </p>
      ) : (
        <>
          <div
            role="group"
            aria-label={t("patient.home.filterByCategory")}
            className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none] desktop:mx-0 desktop:flex-wrap desktop:px-0 [&::-webkit-scrollbar]:hidden"
          >
            {chips.map((chip) => {
              const on = chip.id === picked;
              return (
                <button
                  key={chip.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setPicked(chip.id)}
                  className={`min-h-10 flex-none cursor-pointer rounded-full border px-4 text-[15px] font-semibold whitespace-nowrap ${
                    on ? "border-ink bg-ink text-surface" : "border-line-strong bg-surface text-ink"
                  }`}
                >
                  {chip.name}
                </button>
              );
            })}
          </div>

          <ul className="grid grid-cols-2 gap-2.5 desktop:grid-cols-4">
            {tiles.map((illness) => (
              <li key={illness.id} className="flex">
                <Link
                  href={`/remedies?illness=${encodeURIComponent(illness.slug)}`}
                  className="flex min-h-23 w-full flex-col gap-0.5 rounded-[10px] border border-line bg-surface p-3.5 text-ink hover:border-line-strong"
                >
                  <span className="font-display text-[22px] leading-[1.35]">{illness.name}</span>
                  <span className="mt-auto text-[13px] text-ink-muted">
                    {illness.remedy_count === 1
                      ? t("patient.home.remedyCountOne")
                      : fill(t("patient.home.remedyCount"), {
                          count: nf.format(illness.remedy_count),
                        })}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
