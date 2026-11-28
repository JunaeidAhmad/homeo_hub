"use client";

import Image from "next/image";
import { useEffect, useId, useRef, useState, type ChangeEvent } from "react";

import { FieldError, FormAlert } from "@/components/form/fields";
import { fill } from "@/i18n/catalog";
import type { AdminMessages } from "@/i18n/messages/admin";
import { useMessages } from "@/i18n/provider";

import { useStaffSession } from "../session";
import { useAdminSubmit } from "../use-admin-submit";
import type { Remedy } from "./RemedyEditor";

const BUTTON =
  "flex min-h-11 cursor-pointer items-center justify-center rounded-control border border-line-strong bg-surface px-4 font-semibold";
const ACCEPT = "image/jpeg,image/png,image/webp";
const MAX_BYTES = 5 * 1024 * 1024; // the API's limit (common/images.py)

type StaffApi = ReturnType<typeof useStaffSession>["api"];

/** Send a picture for a saved remedy, as multipart form data. */
export function uploadPicture(api: StaffApi, id: string, file: File) {
  return api.PUT("/api/v1/admin/remedies/{id}/picture/", {
    params: { path: { id } },
    body: { picture: file as unknown as string },
    bodySerializer: () => {
      const form = new FormData();
      form.append("picture", file);
      return form;
    },
  });
}

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
    void submit(() => uploadPicture(api, remedy.id, file), onChanged);
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
            accept={ACCEPT}
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

/**
 * Choose a picture for a remedy that is not saved yet. Only previewed here; the editor
 * uploads it once the remedy is created.
 */
export function NewPictureField({
  file,
  onChange,
  disabled,
}: {
  file: File | null;
  onChange: (file: File | null) => void;
  disabled?: boolean;
}) {
  const { t } = useMessages<AdminMessages>();
  const id = useId();
  const [error, setError] = useState("");
  const [preview, setPreview] = useState("");
  const previewRef = useRef("");

  // Free the local preview address when it is replaced or the form goes away.
  function showPreview(next: File | null) {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = next ? URL.createObjectURL(next) : "";
    setPreview(previewRef.current);
  }
  useEffect(() => () => showPreview(null), []);

  function pick(next: File | null) {
    showPreview(next);
    onChange(next);
  }

  function choose(event: ChangeEvent<HTMLInputElement>) {
    const chosen = event.target.files?.[0];
    event.target.value = "";
    if (!chosen) return;
    if (!ACCEPT.split(",").includes(chosen.type)) {
      setError(t("admin.error.unsupported_type"));
      return;
    }
    if (chosen.size > MAX_BYTES) {
      setError(t("admin.error.file_too_large"));
      return;
    }
    setError("");
    pick(chosen);
  }

  return (
    <section aria-labelledby={`${id}-title`} className="flex flex-col gap-3">
      <h3 id={`${id}-title`} className="text-[15px] font-semibold">
        {t("admin.remedy.picture")}
      </h3>
      {file && preview ? (
        // A local preview (blob: address), so not run through next/image.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={preview}
          alt={t("admin.remedy.picturePreview")}
          className="h-auto max-h-60 w-60 rounded-panel border border-line bg-mist object-contain"
        />
      ) : (
        <p className="text-sm text-ink-muted">{t("admin.remedy.pictureNone")}</p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <label className={`${BUTTON} has-focus-visible:outline-3 has-focus-visible:outline-primary`}>
          {t(file ? "admin.remedy.pictureReplace" : "admin.remedy.pictureChoose")}
          <input
            type="file"
            accept={ACCEPT}
            disabled={disabled}
            onChange={choose}
            aria-describedby={`${id}-hint`}
            className="sr-only"
          />
        </label>
        {file && (
          <button
            type="button"
            disabled={disabled}
            onClick={() => pick(null)}
            className={BUTTON}
          >
            {t("admin.remedy.pictureRemove")}
          </button>
        )}
      </div>
      <p id={`${id}-hint`} className="text-sm text-ink-muted">
        {t("admin.remedy.pictureHintNew")}
      </p>
      {error && <FieldError>{error}</FieldError>}
    </section>
  );
}
