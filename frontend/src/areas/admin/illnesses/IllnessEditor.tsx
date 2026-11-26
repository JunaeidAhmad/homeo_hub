"use client";

import { useId, useState, type FormEvent } from "react";

import type { components } from "@/api/schema";
import { FormAlert, TextAreaField, TextField } from "@/components/form/fields";
import { fill } from "@/i18n/catalog";
import type { AdminMessages } from "@/i18n/messages/admin";
import { useMessages } from "@/i18n/provider";

import { useStaffSession } from "../session";
import { useAdminSubmit } from "../use-admin-submit";
import type { IllnessCategory } from "./CategoryEditor";
import { RankedRemedies } from "./RankedRemedies";

export type Illness = components["schemas"]["AdminIllness"];
export type IllnessStatus = components["schemas"]["IllnessStatusEnum"];
export const ILLNESS_STATUSES: IllnessStatus[] = ["INACTIVE", "ACTIVE"];

export function IllnessEditor({
  illness,
  categories,
  onSaved,
  onClose,
}: {
  illness?: Illness;
  categories: IllnessCategory[];
  onSaved: (saved: Illness) => void;
  onClose: () => void;
}) {
  const { t } = useMessages<AdminMessages>();
  const { api } = useStaffSession();
  const { pending, problems, setProblems, submit } = useAdminSubmit();
  const categoryId = useId();
  const statusId = useId();

  const [category, setCategory] = useState(illness?.category ?? categories[0]?.id ?? "");
  const [nameEn, setNameEn] = useState(illness?.name_en ?? "");
  const [nameBn, setNameBn] = useState(illness?.name_bn ?? "");
  const [slug, setSlug] = useState(illness?.slug ?? "");
  const [shortDescEn, setShortDescEn] = useState(illness?.short_description_en ?? "");
  const [shortDescBn, setShortDescBn] = useState(illness?.short_description_bn ?? "");
  const [status, setStatus] = useState<IllnessStatus>(illness?.status ?? "INACTIVE");

  function save(event: FormEvent) {
    event.preventDefault();
    const missing: Record<string, string> = {};
    if (!category) missing.category = t("admin.error.required");
    if (!nameEn.trim()) missing.name_en = t("admin.error.required");
    if (!shortDescEn.trim()) missing.short_description_en = t("admin.error.required");
    if (Object.keys(missing).length > 0) {
      setProblems({ fields: missing, form: t("admin.error.required") });
      return;
    }

    const body = {
      category,
      name_en: nameEn,
      name_bn: nameBn,
      slug,
      short_description_en: shortDescEn,
      short_description_bn: shortDescBn,
      status,
    };

    void submit(
      () =>
        illness
          ? api.PATCH("/api/v1/admin/illnesses/{id}/", {
              params: { path: { id: illness.id } },
              body,
            })
          : api.POST("/api/v1/admin/illnesses/", { body }),
      onSaved,
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <button
        type="button"
        onClick={onClose}
        className="min-h-11 self-start font-semibold text-primary underline"
      >
        {t("admin.illness.close")}
      </button>
      <h2 className="font-display text-2xl">
        {illness ? fill(t("admin.staff.editTitle"), { name: illness.name_en }) : t("admin.illness.add")}
      </h2>

      <form
        onSubmit={save}
        noValidate
        className="flex flex-col gap-5 rounded-panel border border-line bg-surface p-4 desktop:p-6"
      >
        {problems.form && <FormAlert>{problems.form}</FormAlert>}
        <div className="grid gap-5 desktop:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label htmlFor={categoryId} className="text-[15px] font-semibold">
              {t("admin.illness.category")}
            </label>
            <select
              id={categoryId}
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              className="min-h-13 rounded-control border border-line-strong bg-surface px-3 text-[17px]"
            >
              {categories.length === 0 && <option value="">—</option>}
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name_en}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor={statusId} className="text-[15px] font-semibold">
              {t("admin.remedy.status")}
            </label>
            <select
              id={statusId}
              value={status}
              onChange={(event) => setStatus(event.target.value as IllnessStatus)}
              className="min-h-13 rounded-control border border-line-strong bg-surface px-3 text-[17px]"
            >
              {ILLNESS_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {t(`admin.illness.status.${value}`)}
                </option>
              ))}
            </select>
          </div>

          <TextField
            label={t("admin.category.nameEn")}
            value={nameEn}
            error={problems.fields.name_en}
            onChange={(event) => setNameEn(event.target.value)}
            maxLength={150}
          />
          <TextField
            label={t("admin.category.nameBn")}
            value={nameBn}
            error={problems.fields.name_bn}
            onChange={(event) => setNameBn(event.target.value)}
            lang="bn"
            maxLength={150}
          />
          <TextField
            label={t("admin.remedy.slug")}
            hint={t("admin.illness.slugHint")}
            value={slug}
            error={problems.fields.slug}
            onChange={(event) => setSlug(event.target.value)}
            maxLength={160}
            autoCapitalize="none"
            spellCheck={false}
          />
        </div>

        <div className="grid gap-4 border-t border-line pt-4 desktop:grid-cols-2">
          <TextAreaField
            label={t("admin.illness.shortDescEn")}
            value={shortDescEn}
            error={problems.fields.short_description_en}
            onChange={(event) => setShortDescEn(event.target.value)}
            maxLength={2000}
          />
          <TextAreaField
            label={t("admin.illness.shortDescBn")}
            hint={t("admin.remedy.banglaHint")}
            value={shortDescBn}
            error={problems.fields.short_description_bn}
            onChange={(event) => setShortDescBn(event.target.value)}
            lang="bn"
            maxLength={2000}
          />
        </div>

        <button
          type="submit"
          disabled={pending}
          className="min-h-13 rounded-control bg-primary px-6 font-bold text-surface disabled:opacity-60 desktop:self-start"
        >
          {t(illness ? "admin.staff.save" : "admin.illness.create")}
        </button>
      </form>

      {illness && <RankedRemedies key={illness.id} illnessId={illness.id} />}
    </div>
  );
}
