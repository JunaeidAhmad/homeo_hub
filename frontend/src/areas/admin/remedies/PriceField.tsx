"use client";

import { useState, type FormEvent } from "react";

import type { components } from "@/api/schema";
import { FormAlert, TextField } from "@/components/form/fields";
import { parseTakaToPoisha, poishaToTakaInput } from "@/i18n/format";
import type { AdminMessages } from "@/i18n/messages/admin";
import { useMessages } from "@/i18n/provider";

import { useStaffSession } from "../session";
import { useAdminSubmit } from "../use-admin-submit";
import type { Remedy } from "./RemedyEditor";

type RemedyForm = components["schemas"]["FormEnum"];
const FORMS: RemedyForm[] = ["PILL", "LIQUID"];

type RowState = { amount: string; isActive: boolean };
type RowsState = Record<RemedyForm, RowState>;

function initialRows(remedy: Remedy): RowsState {
  const byForm = new Map(remedy.prices.map((price) => [price.form, price]));
  return {
    PILL: {
      amount: byForm.has("PILL") ? poishaToTakaInput(byForm.get("PILL")!.price_poisha) : "",
      isActive: byForm.get("PILL")?.is_active ?? false,
    },
    LIQUID: {
      amount: byForm.has("LIQUID") ? poishaToTakaInput(byForm.get("LIQUID")!.price_poisha) : "",
      isActive: byForm.get("LIQUID")?.is_active ?? false,
    },
  };
}

/** Patient price list editor for one saved remedy (pill & liquid, in taka). */
export function PriceField({
  remedy,
  onChanged,
}: {
  remedy: Remedy;
  onChanged: (remedy: Remedy) => void;
}) {
  const { t } = useMessages<AdminMessages>();
  const { api } = useStaffSession();
  const { pending, problems, setProblems, submit } = useAdminSubmit();
  const [rows, setRows] = useState<RowsState>(() => initialRows(remedy));

  function updateRow(form: RemedyForm, patch: Partial<RowState>) {
    setRows((now) => ({ ...now, [form]: { ...now[form], ...patch } }));
  }

  function save(event: FormEvent) {
    event.preventDefault();
    const fieldErrors: Record<string, string> = {};
    const payload: components["schemas"]["AdminPriceInputRequest"][] = [];

    for (const form of FORMS) {
      const row = rows[form];
      const trimmed = row.amount.trim();
      if (!trimmed) {
        if (row.isActive) {
          fieldErrors[form] = t("admin.error.priceInvalid");
        }
        continue;
      }
      const poisha = parseTakaToPoisha(trimmed);
      if (poisha === null) {
        fieldErrors[form] = t("admin.error.priceInvalid");
        continue;
      }
      payload.push({ form, price_poisha: poisha, is_active: row.isActive });
    }

    if (Object.keys(fieldErrors).length > 0) {
      setProblems({ fields: fieldErrors, form: t("admin.error.priceInvalid") });
      return;
    }
    if (payload.length === 0) {
      setProblems({ fields: {}, form: t("admin.error.priceEmpty") });
      return;
    }

    void submit(
      () =>
        api.PUT("/api/v1/admin/remedies/{id}/prices/", {
          params: { path: { id: remedy.id } },
          body: payload,
        }),
      (updated) => {
        setRows(initialRows(updated));
        onChanged(updated);
      },
    );
  }

  return (
    <form onSubmit={save} noValidate className="flex flex-col gap-4">
      <h3 className="text-[15px] font-semibold">{t("admin.remedy.prices")}</h3>
      {problems.form && <FormAlert>{problems.form}</FormAlert>}
      <div className="flex flex-col gap-4">
        {FORMS.map((form) => {
          const row = rows[form];
          return (
            <div key={form} className="flex flex-col gap-2 border-t border-line pt-3 first:border-t-0 first:pt-0">
              <TextField
                label={t(`admin.remedy.form.${form}`)}
                prefix="৳"
                inputMode="decimal"
                placeholder="0"
                value={row.amount}
                error={problems.fields[form]}
                onChange={(event) => updateRow(form, { amount: event.target.value })}
              />
              <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-[15px]">
                <input
                  type="checkbox"
                  checked={row.isActive}
                  onChange={(event) => updateRow(form, { isActive: event.target.checked })}
                  className="size-5 accent-primary"
                />
                <span>{t("admin.remedy.priceAvailable")}</span>
              </label>
            </div>
          );
        })}
      </div>
      <button
        type="submit"
        disabled={pending}
        className="mt-auto min-h-13 self-start rounded-control bg-primary px-5 font-bold text-surface disabled:opacity-60"
      >
        {t("admin.remedy.savePrices")}
      </button>
    </form>
  );
}
