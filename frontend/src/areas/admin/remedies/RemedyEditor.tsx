"use client";

import Link from "next/link";
import { useId, useState, type FormEvent } from "react";

import type { components } from "@/api/schema";
import { FormAlert, TextAreaField, TextField } from "@/components/form/fields";
import { fill } from "@/i18n/catalog";
import type { AdminMessages } from "@/i18n/messages/admin";
import { useMessages } from "@/i18n/provider";

import { useStaffSession } from "../session";
import { useAdminSubmit } from "../use-admin-submit";
import { PictureField } from "./PictureField";
import { PriceField } from "./PriceField";

export type Remedy = components["schemas"]["AdminRemedy"];
export type RemedyStatus = components["schemas"]["RemedyStatusEnum"];
export const STATUSES: RemedyStatus[] = ["DRAFT", "ACTIVE", "ARCHIVED"];

/** The long texts, each written in English and (optionally) Bangla. */
const TEXTS = [
  { base: "indication", label: "admin.remedy.indication", perLine: false },
  { base: "description", label: "admin.remedy.description", perLine: false },
  { base: "advice_do", label: "admin.remedy.adviceDo", perLine: true },
  { base: "advice_dont", label: "admin.remedy.adviceDont", perLine: true },
] as const;

type TextName = `${(typeof TEXTS)[number]["base"]}_${"en" | "bn"}`;
type Values = Record<TextName | "name" | "name_bn" | "slug", string> & { status: RemedyStatus };

function startingValues(remedy?: Remedy): Values {
  const texts = Object.fromEntries(
    TEXTS.flatMap(({ base }) =>
      (["en", "bn"] as const).map((language) => {
        const name: TextName = `${base}_${language}`;
        return [name, remedy?.[name] ?? ""];
      }),
    ),
  ) as Record<TextName, string>;
  return {
    ...texts,
    name: remedy?.name ?? "",
    name_bn: remedy?.name_bn ?? "",
    slug: remedy?.slug ?? "",
    status: remedy?.status ?? "DRAFT",
  };
}

export function RemedyEditor({
  remedy,
  onSaved,
  onPictureChanged,
  onPricesSaved,
  onClose,
}: {
  remedy?: Remedy;
  onSaved: (saved: Remedy) => void;
  onPictureChanged: (remedy: Remedy) => void;
  onPricesSaved: (remedy: Remedy) => void;
  onClose: () => void;
}) {
  const { t } = useMessages<AdminMessages>();
  const { api } = useStaffSession();
  const { pending, problems, setProblems, submit } = useAdminSubmit();
  const [values, setValues] = useState(() => startingValues(remedy));
  const statusId = useId();

  const bind = (name: Exclude<keyof Values, "status">) => ({
    value: values[name],
    error: problems.fields[name],
    onChange: (event: { target: { value: string } }) =>
      setValues((now) => ({ ...now, [name]: event.target.value })),
  });

  function save(event: FormEvent) {
    event.preventDefault();
    const required = ["name", ...TEXTS.map(({ base }) => `${base}_en`)] as (keyof Values)[];
    const missing = Object.fromEntries(
      required
        .filter((name) => !values[name].trim())
        .map((name) => [name, t("admin.error.required")]),
    );
    if (Object.keys(missing).length > 0) {
      setProblems({ fields: missing, form: t("admin.error.required") });
      return;
    }
    void submit(
      () =>
        remedy
          ? api.PATCH("/api/v1/admin/remedies/{id}/", {
              params: { path: { id: remedy.id } },
              body: values,
            })
          : api.POST("/api/v1/admin/remedies/", { body: values }),
      (saved) => {
        setValues(startingValues(saved));
        onSaved(saved);
      },
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <button
        type="button"
        onClick={onClose}
        className="min-h-11 self-start font-semibold text-primary underline"
      >
        {t("admin.remedy.close")}
      </button>
      <h2 className="font-display text-2xl">
        {remedy ? fill(t("admin.remedy.editTitle"), { name: remedy.name }) : t("admin.remedy.add")}
      </h2>

      {remedy && (
        <div className="grid gap-5 desktop:grid-cols-2">
          <div className="flex flex-col justify-between rounded-panel border border-line bg-surface p-4 desktop:p-6">
            <PictureField remedy={remedy} onChanged={onPictureChanged} />
            {remedy.status === "ACTIVE" && (
              <Link
                href={`/remedies/${remedy.slug}`}
                className="mt-3 inline-flex min-h-11 items-center font-semibold text-primary underline"
              >
                {t("admin.remedy.viewPage")}
              </Link>
            )}
          </div>
          <div className="rounded-panel border border-line bg-surface p-4 desktop:p-6">
            <PriceField remedy={remedy} onChanged={onPricesSaved} />
          </div>
        </div>
      )}

      <form
        onSubmit={save}
        noValidate
        className="flex flex-col gap-5 rounded-panel border border-line bg-surface p-4 desktop:p-6"
      >
        {problems.form && <FormAlert>{problems.form}</FormAlert>}
        <div className="grid gap-5 desktop:grid-cols-2">
          <TextField
            label={t("admin.remedy.name")}
            {...bind("name")}
            lang="la"
            maxLength={150}
            autoComplete="off"
          />
          <TextField
            label={t("admin.remedy.nameBn")}
            {...bind("name_bn")}
            lang="bn"
            maxLength={150}
            autoComplete="off"
          />
          <TextField
            label={t("admin.remedy.slug")}
            hint={t("admin.remedy.slugHint")}
            {...bind("slug")}
            maxLength={160}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
          />
          <div className="flex flex-col gap-1.5">
            <label htmlFor={statusId} className="text-[15px] font-semibold">
              {t("admin.remedy.status")}
            </label>
            <p id={`${statusId}-hint`} className="text-sm text-ink-muted">
              {t("admin.remedy.statusHint")}
            </p>
            <select
              id={statusId}
              aria-describedby={`${statusId}-hint`}
              value={values.status}
              onChange={(event) =>
                setValues((now) => ({ ...now, status: event.target.value as RemedyStatus }))
              }
              className="min-h-13 rounded-control border border-line-strong bg-surface px-3 text-[17px]"
            >
              {STATUSES.map((status) => (
                <option key={status} value={status}>
                  {t(`admin.remedy.status.${status}`)}
                </option>
              ))}
            </select>
          </div>
        </div>

        {TEXTS.map(({ base, label, perLine }) => (
          <div key={base} className="grid gap-4 border-t border-line pt-4 desktop:grid-cols-2">
            <TextAreaField
              label={fill(t("admin.remedy.english"), { field: t(label) })}
              hint={perLine ? t("admin.remedy.perLine") : undefined}
              {...bind(`${base}_en`)}
              lang="en"
              maxLength={5000}
            />
            <TextAreaField
              label={fill(t("admin.remedy.bangla"), { field: t(label) })}
              hint={t("admin.remedy.banglaHint")}
              {...bind(`${base}_bn`)}
              lang="bn"
              maxLength={5000}
            />
          </div>
        ))}

        <button
          type="submit"
          disabled={pending}
          className="min-h-13 rounded-control bg-primary px-6 font-bold text-surface disabled:opacity-60 desktop:self-start"
        >
          {t(remedy ? "admin.staff.save" : "admin.remedy.create")}
        </button>
      </form>
    </div>
  );
}
