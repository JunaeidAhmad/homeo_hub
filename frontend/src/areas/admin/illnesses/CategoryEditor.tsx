"use client";

import { useState, type FormEvent } from "react";

import type { components } from "@/api/schema";
import { FormAlert, TextField } from "@/components/form/fields";
import { fill } from "@/i18n/catalog";
import type { AdminMessages } from "@/i18n/messages/admin";
import { useMessages } from "@/i18n/provider";

import { useStaffSession } from "../session";
import { useAdminSubmit } from "../use-admin-submit";

export type IllnessCategory = components["schemas"]["AdminIllnessCategory"];

export function CategoryEditor({
  category,
  onSaved,
  onClose,
}: {
  category?: IllnessCategory;
  onSaved: (saved: IllnessCategory) => void;
  onClose: () => void;
}) {
  const { t } = useMessages<AdminMessages>();
  const { api } = useStaffSession();
  const { pending, problems, setProblems, submit } = useAdminSubmit();

  const [nameEn, setNameEn] = useState(category?.name_en ?? "");
  const [nameBn, setNameBn] = useState(category?.name_bn ?? "");
  const [slug, setSlug] = useState(category?.slug ?? "");
  const [sortOrder, setSortOrder] = useState(String(category?.sort_order ?? 0));
  const [isActive, setIsActive] = useState(category?.is_active ?? true);

  function save(event: FormEvent) {
    event.preventDefault();
    if (!nameEn.trim()) {
      setProblems({ fields: { name_en: t("admin.error.required") }, form: t("admin.error.required") });
      return;
    }
    const order = Number(sortOrder);
    const body = {
      name_en: nameEn,
      name_bn: nameBn,
      slug,
      sort_order: Number.isFinite(order) && order >= 0 ? Math.trunc(order) : 0,
      is_active: isActive,
    };
    void submit(
      () =>
        category
          ? api.PATCH("/api/v1/admin/illness-categories/{id}/", {
              params: { path: { id: category.id } },
              body,
            })
          : api.POST("/api/v1/admin/illness-categories/", { body }),
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
        {category
          ? fill(t("admin.staff.editTitle"), { name: category.name_en })
          : t("admin.category.add")}
      </h2>

      <form
        onSubmit={save}
        noValidate
        className="flex flex-col gap-5 rounded-panel border border-line bg-surface p-4 desktop:p-6"
      >
        {problems.form && <FormAlert>{problems.form}</FormAlert>}
        <div className="grid gap-5 desktop:grid-cols-2">
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
          <TextField
            label={t("admin.category.sortOrder")}
            type="number"
            min={0}
            inputMode="numeric"
            value={sortOrder}
            error={problems.fields.sort_order}
            onChange={(event) => setSortOrder(event.target.value)}
          />
        </div>

        <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-[15px] font-semibold">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(event) => setIsActive(event.target.checked)}
            className="size-5 accent-primary"
          />
          <span>{t("admin.staff.active")}</span>
        </label>

        <button
          type="submit"
          disabled={pending}
          className="min-h-13 rounded-control bg-primary px-6 font-bold text-surface disabled:opacity-60 desktop:self-start"
        >
          {t(category ? "admin.staff.save" : "admin.category.create")}
        </button>
      </form>
    </div>
  );
}
