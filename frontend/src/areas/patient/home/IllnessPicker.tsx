"use client";

import Form from "next/form";
import { useId } from "react";

import { Icon } from "@/components/Icon";
import type { CommonMessages } from "@/i18n/messages/common";
import type { PatientMessages } from "@/i18n/messages/patient";
import { useMessages } from "@/i18n/provider";

import { useIllnessCategories } from "./use-illness-categories";

const CHEVRON = "M6 9l6 6 6-6";

/** Home's illness dropdown: submits to /remedies?illness=<slug>. */
export function IllnessPicker() {
  const { t } = useMessages<CommonMessages & PatientMessages>();
  const { status, categories } = useIllnessCategories();
  const selectId = useId();

  return (
    <Form action="/remedies" className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <label htmlFor={selectId} className="text-[15px] font-semibold text-surface">
          {t("patient.home.illnessLabel")}
        </label>
        <span className="relative flex">
          <select
            id={selectId}
            name="illness"
            required
            defaultValue=""
            disabled={status === "loading"}
            className="min-h-13 w-full cursor-pointer appearance-none rounded-control border-0 bg-surface pr-11 pl-3.5 text-[17px] font-semibold text-ink disabled:cursor-wait"
          >
            <option value="" disabled>
              {status === "loading" ? t("table.loading") : t("patient.home.illnessPlaceholder")}
            </option>
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
          <span className="pointer-events-none absolute top-4 right-3.5 text-primary">
            <Icon path={CHEVRON} size={20} strokeWidth={2.4} />
          </span>
        </span>
        {status === "error" && (
          <p role="alert" className="text-sm text-amber-wash">
            {t("table.error")}
          </p>
        )}
      </div>
      <button
        type="submit"
        className="inline-flex min-h-13 items-center justify-center rounded-control bg-surface px-5.5 text-[17px] font-bold text-primary-deep desktop:self-start"
      >
        {t("patient.home.showRemedies")}
      </button>
    </Form>
  );
}
