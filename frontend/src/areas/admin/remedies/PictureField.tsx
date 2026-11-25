"use client";

import Image from "next/image";
import { useId, type ChangeEvent } from "react";

import { FieldError, FormAlert } from "@/components/form/fields";
import { fill } from "@/i18n/catalog";
import type { AdminMessages } from "@/i18n/messages/admin";
import { useMessages } from "@/i18n/provider";

import { useStaffSession } from "../session";
import { useAdminSubmit } from "../use-admin-submit";
import type { Remedy } from "./RemedyEditor";

const BUTTON =
  "flex min-h-11 cursor-pointer items-center justify-center rounded-control border border-line-strong bg-surface px-4 font-semibold";

/** Add, replace or remove a saved remedy's picture. Takes effect at once. */
export function PictureField({
  remedy,
  onChanged,
}: {
  remedy: Remedy;
  onChanged: (remedy: Remedy) => void;
}) {
  const { t } = useMessages<AdminMessages>();
  const { api } = useStaffSession();
  const { pending, problems, submit } = useAdminSubmit();
  const id = useId();
  const path = { id: remedy.id };

  function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ""; // choosing the same file again should upload it again
    if (!file) return;
    void submit(
      () =>
        api.PUT("/api/v1/admin/remedies/{id}/picture/", {
          params: { path },
          body: { picture: file as unknown as string },
          bodySerializer: () => {
            const form = new FormData();
            form.append("picture", file);
            return form;
          },
        }),
      onChanged,
    );
  }

  return (
    <section aria-labelledby={`${id}-title`} className="flex flex-col gap-3">
      <h3 id={`${id}-title`} className="text-[15px] font-semibold">
        {t("admin.remedy.picture")}
      </h3>
      {remedy.picture_url ? (
        <Image
          unoptimized
          src={remedy.picture_url}
          alt={fill(t("admin.remedy.pictureAlt"), { name: remedy.name })}
          width={240}
          height={240}
          className="h-auto max-h-60 w-60 rounded-panel border border-line bg-mist object-contain"
        />
      ) : (
        <p className="text-sm text-ink-muted">{t("admin.remedy.pictureNone")}</p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <label className={`${BUTTON} has-focus-visible:outline-3 has-focus-visible:outline-primary`}>
          {pending ? t("admin.remedy.pictureBusy") : t("admin.remedy.pictureChoose")}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={pending}
            onChange={upload}
            aria-describedby={`${id}-hint`}
            className="sr-only"
          />
        </label>
        {remedy.picture_url && (
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              void submit(
                () => api.DELETE("/api/v1/admin/remedies/{id}/picture/", { params: { path } }),
                onChanged,
              )
            }
            className={BUTTON}
          >
            {t("admin.remedy.pictureRemove")}
          </button>
        )}
      </div>
      <p id={`${id}-hint`} className="text-sm text-ink-muted">
        {t("admin.remedy.pictureHint")}
      </p>
      {problems.fields.picture && <FieldError>{problems.fields.picture}</FieldError>}
      {problems.form && <FormAlert>{problems.form}</FormAlert>}
    </section>
  );
}
