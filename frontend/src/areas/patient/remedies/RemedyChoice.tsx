"use client";

import { useId, useState } from "react";

import type { components } from "@/api/schema";
import { SegmentedChoice } from "@/components/form/fields";
import { formatMoney } from "@/i18n/format";
import type { PatientMessages } from "@/i18n/messages/patient";
import { useMessages } from "@/i18n/provider";

export type RemedyForm = components["schemas"]["FormEnum"];
export type Potency = components["schemas"]["PotenciesEnum"];
export type PatientPrice = components["schemas"]["PatientPrice"];

export const DEFAULT_POTENCIES: Potency[] = ["6C", "30C", "200C", "1M"];
export const REMEDY_FORMS: RemedyForm[] = ["PILL", "LIQUID"];

export type RemedyChoiceValue = {
  potency: Potency;
  form: RemedyForm | null;
  price: number | null;
};

export function priceForForm(prices: PatientPrice[], form: RemedyForm | null): number | null {
  if (!form) return null;
  return prices.find((entry) => entry.form === form)?.price_poisha ?? null;
}

export function initialChoice(
  potencies: Potency[],
  prices: PatientPrice[],
  requestedPotency?: string | null,
  requestedForm?: string | null,
): RemedyChoiceValue {
  const list = potencies.length > 0 ? potencies : DEFAULT_POTENCIES;
  const potency = list.includes(requestedPotency as Potency)
    ? (requestedPotency as Potency)
    : list.includes("30C")
      ? "30C"
      : list[0];

  const available = REMEDY_FORMS.filter((f) => priceForForm(prices, f) !== null);
  const form = available.includes(requestedForm as RemedyForm)
    ? (requestedForm as RemedyForm)
    : (available[0] ?? null);

  return { potency, form, price: priceForForm(prices, form) };
}

/** Potency and form (pill / liquid) pickers for a remedy, following the patient price list. */
export function RemedyChoice({
  potencies = DEFAULT_POTENCIES,
  prices,
  initialPotency,
  initialForm,
  compact = false,
  onChange,
}: {
  potencies?: Potency[];
  prices: PatientPrice[];
  initialPotency?: string | null;
  initialForm?: string | null;
  compact?: boolean;
  onChange?: (choice: RemedyChoiceValue) => void;
}) {
  const { locale, t } = useMessages<PatientMessages>();
  const potencyId = useId();
  const groupName = useId();
  const list = potencies.length > 0 ? potencies : DEFAULT_POTENCIES;

  const [choice, setChoice] = useState<RemedyChoiceValue>(() =>
    initialChoice(list, prices, initialPotency, initialForm),
  );

  function update(next: Partial<{ potency: Potency; form: RemedyForm | null }>) {
    const potency = next.potency ?? choice.potency;
    const form = next.form !== undefined ? next.form : choice.form;
    const updated: RemedyChoiceValue = {
      potency,
      form,
      price: priceForForm(prices, form),
    };
    setChoice(updated);
    onChange?.(updated);
  }

  return (
    <div className={`flex flex-col ${compact ? "gap-2.5" : "gap-3.5"}`}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex min-w-32 flex-col gap-1">
          <label htmlFor={potencyId} className="text-[15px] font-semibold">
            {t("patient.remedy.potency")}
          </label>
          <select
            id={potencyId}
            value={choice.potency}
            onChange={(event) => update({ potency: event.target.value as Potency })}
            className="min-h-11 rounded-control border border-line-strong bg-surface px-3 text-base font-semibold"
          >
            {list.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>

        <div className="text-right">
          {choice.price !== null ? (
            <span className="font-display text-2xl leading-none font-normal text-ink">
              {formatMoney(locale, choice.price)}
            </span>
          ) : (
            <span className="text-sm font-medium text-ink-muted">
              {t("patient.remedy.unavailable")}
            </span>
          )}
        </div>
      </div>

      <SegmentedChoice<RemedyForm>
        legend={t("patient.remedy.form")}
        name={`form-${groupName}`}
        value={choice.form}
        onChange={(form) => update({ form })}
        options={REMEDY_FORMS.map((form) => {
          const unavailable = priceForForm(prices, form) === null;
          return {
            value: form,
            label: t(`patient.remedy.form.${form}`),
            disabled: unavailable,
            note: unavailable ? t("patient.remedy.unavailable") : undefined,
          };
        })}
      />
    </div>
  );
}
