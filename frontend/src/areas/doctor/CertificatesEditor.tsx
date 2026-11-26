"use client";

import { useId, type ChangeEvent } from "react";

import type { components } from "@/api/schema";
import { FieldError, FormAlert } from "@/components/form/fields";
import { numberFormat } from "@/i18n/format";
import type { DoctorMessages } from "@/i18n/messages/doctor";
import { useMessages } from "@/i18n/provider";

import { useDoctorSession } from "./session";
import { useDoctorSubmit } from "./use-doctor-submit";

type Certificate = components["schemas"]["DoctorCertificate"];

const BUTTON =
  "inline-flex min-h-11 cursor-pointer items-center justify-center rounded-control border border-line-strong bg-surface px-4 text-[15px] font-semibold disabled:opacity-60";

function formatFileSize(locale: "en" | "bn", bytes: number): string {
  const nf = numberFormat(locale, { maximumFractionDigits: 1 });
  if (bytes >= 1024 * 1024) return `${nf.format(bytes / (1024 * 1024))} MB`;
  return `${numberFormat(locale).format(Math.max(1, Math.round(bytes / 1024)))} KB`;
}

/** Upload, view, and remove doctor degree/registration certificates. */
export function CertificatesEditor({
  certificates,
  editable,
  onChanged,
  error,
}: {
  certificates: Certificate[];
  editable: boolean;
  onChanged: (next: Certificate[]) => void;
  error?: string;
}) {
  const { locale, t } = useMessages<DoctorMessages>();
  const { api } = useDoctorSession();
  const { pending, problems, submit } = useDoctorSubmit();
  const id = useId();

  function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    void submit(
      () =>
        api.POST("/api/v1/doctor/application/certificates/", {
          body: { file: file as unknown as string },
          bodySerializer: () => {
            const form = new FormData();
            form.append("file", file);
            return form;
          },
        }),
      (created) => {
        onChanged([...certificates, created]);
      },
    );
  }

  function remove(certId: string) {
    void submit(
      () =>
        api.DELETE("/api/v1/doctor/application/certificates/{id}/", {
          params: { path: { id: certId } },
        }),
      () => {
        onChanged(certificates.filter((item) => item.id !== certId));
      },
    );
  }

  return (
    <section aria-labelledby={`${id}-title`} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 id={`${id}-title`} className="text-[16px] font-semibold text-ink">
          {t("doctor.certs.title")}
        </h2>
        <p className="text-sm text-ink-soft">{t("doctor.certs.hint")}</p>
      </div>

      {problems.form && <FormAlert>{problems.form}</FormAlert>}
      {problems.fields.file && <FieldError id={`${id}-file-error`}>{problems.fields.file}</FieldError>}
      {error && <FieldError id={`${id}-req-error`}>{error}</FieldError>}

      {certificates.length === 0 ? (
        <p className="rounded-panel border border-line bg-mist/50 px-4 py-3 text-sm text-ink-muted">
          {t("doctor.certs.empty")}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {certificates.map((cert) => (
            <li
              key={cert.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-panel border border-line bg-surface px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-ink">{cert.original_name}</p>
                <p className="text-xs text-ink-muted">{formatFileSize(locale, cert.size)}</p>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={cert.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={BUTTON}
                >
                  {t("doctor.certs.open")}
                </a>
                {editable && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => remove(cert.id)}
                    className={`${BUTTON} text-danger`}
                  >
                    {t("doctor.certs.remove")}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {editable && (
        <div>
          <label
            className={`${BUTTON} has-focus-visible:outline-3 has-focus-visible:outline-primary`}
          >
            {pending ? t("doctor.certs.uploading") : t("doctor.certs.upload")}
            <input
              type="file"
              accept="application/pdf,image/jpeg,image/png,image/webp"
              disabled={pending}
              onChange={upload}
              className="sr-only"
            />
          </label>
        </div>
      )}
    </section>
  );
}
