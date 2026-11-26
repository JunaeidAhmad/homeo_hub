"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState, type ChangeEvent } from "react";

import { AccountPanel } from "@/areas/patient/auth/AccountPanel";
import { useSession } from "@/areas/patient/session/SessionProvider";
import { FormAlert } from "@/components/form/fields";
import { PushOptInCard } from "@/components/notifications/PushOptInCard";
import { useDescribeErrorWith } from "@/hooks/use-describe-error";
import { useSubmitWith } from "@/hooks/use-submit";
import { fill } from "@/i18n/catalog";
import { numberFormat } from "@/i18n/format";
import type { PatientMessages } from "@/i18n/messages/patient";
import { useMessages } from "@/i18n/provider";

import { COMPLETENESS_ORDER, PROFILE_SECTIONS, type PatientProfileData } from "./sections";

const BUTTON =
  "inline-flex min-h-11 cursor-pointer items-center justify-center rounded-control border border-line-strong bg-surface px-4 text-sm font-semibold disabled:opacity-60";

export function ProfileOverview() {
  const { locale, t } = useMessages<PatientMessages>();
  const session = useSession();
  const { api } = session;
  const describe = useDescribeErrorWith("patient");
  const { pending, problems, submit } = useSubmitWith(describe);

  const [profile, setProfile] = useState<PatientProfileData | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (session.status !== "signedIn") return;
    const controller = new AbortController();
    api
      .GET("/api/v1/me/profile/", { signal: controller.signal })
      .then(({ data }) => {
        if (data) {
          setProfile(data);
          setFailed(false);
        } else {
          setFailed(true);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => controller.abort();
  }, [api, session.status]);

  if (session.status !== "signedIn") {
    return <AccountPanel />;
  }

  function uploadPicture(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    void submit(
      () =>
        api.PUT("/api/v1/me/profile/picture/", {
          body: { picture: file as unknown as string },
          bodySerializer: () => {
            const form = new FormData();
            form.append("picture", file);
            return form;
          },
        }),
      setProfile,
    );
  }

  function removePicture() {
    void submit(() => api.DELETE("/api/v1/me/profile/picture/"), setProfile);
  }

  const nf = numberFormat(locale);
  const initial = session.patient.full_name.trim().charAt(0).toUpperCase() || "?";

  return (
    <div className="flex flex-col gap-6">
      {failed && <FormAlert>{t("patient.error.generic")}</FormAlert>}

      {profile && (
        <>
          {/* Photo card */}
          <section className="flex flex-wrap items-center gap-4 rounded-panel border border-line bg-surface p-4">
            {profile.picture_url ? (
              <Image
                unoptimized
                src={profile.picture_url}
                alt={profile.full_name}
                width={80}
                height={80}
                className="size-20 rounded-full border border-line object-cover"
              />
            ) : (
              <div
                aria-hidden="true"
                className="flex size-20 items-center justify-center rounded-full border border-line bg-mist font-display text-2xl text-primary-deep"
              >
                {initial}
              </div>
            )}
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <h2 className="text-base font-semibold text-ink">{t("patient.profile.picture")}</h2>
              <p className="text-xs text-ink-muted">{t("patient.profile.pictureHint")}</p>
              <div className="flex flex-wrap items-center gap-2">
                <label className={BUTTON}>
                  {pending
                    ? t("patient.profile.pictureUploading")
                    : profile.picture_url
                      ? t("patient.profile.pictureChange")
                      : t("patient.profile.pictureUpload")}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    disabled={pending}
                    onChange={uploadPicture}
                    className="sr-only"
                  />
                </label>
                {profile.picture_url && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={removePicture}
                    className={`${BUTTON} text-danger`}
                  >
                    {t("patient.profile.pictureRemove")}
                  </button>
                )}
              </div>
              {problems.fields.picture && (
                <p className="text-sm font-medium text-danger">{problems.fields.picture}</p>
              )}
              {problems.form && <FormAlert>{problems.form}</FormAlert>}
            </div>
          </section>

          {/* 7-segment completeness strip */}
          <section className="flex flex-col gap-3 rounded-panel border border-line bg-surface p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-base font-semibold text-ink">
                {fill(t("patient.profile.completeness"), {
                  filled: nf.format(profile.completeness.filled),
                  total: nf.format(profile.completeness.total),
                })}
              </p>
            </div>
            <div
              aria-hidden="true"
              className="grid grid-cols-7 gap-1.5"
            >
              {COMPLETENESS_ORDER.map((key) => (
                <span
                  key={key}
                  className={`h-2.5 rounded-sm ${
                    profile.completeness.sections[key]
                      ? "bg-primary"
                      : "border border-amber/40 bg-amber-wash"
                  }`}
                />
              ))}
            </div>
            <p className="text-sm text-ink-soft">{t("patient.profile.completeNote")}</p>
            {COMPLETENESS_ORDER.some(
              (key) => key !== "picture" && !profile.completeness.sections[key],
            ) && (
              <div className="flex flex-wrap gap-2 pt-1">
                {PROFILE_SECTIONS.filter(
                  (section) => !profile.completeness.sections[section.key],
                ).map((section) => (
                  <Link
                    key={section.key}
                    href={`/profile/${section.key}`}
                    className="inline-flex min-h-9 items-center rounded-control bg-amber-wash px-3 text-xs font-semibold text-ink underline"
                  >
                    {t(section.labelKey)}
                  </Link>
                ))}
              </div>
            )}
          </section>

          {/* Six editable sections */}
          <section className="flex flex-col divide-y divide-line rounded-panel border border-line bg-surface">
            {PROFILE_SECTIONS.map((section) => {
              const filled = profile.completeness.sections[section.key];
              const snippet = section.preview(profile);
              return (
                <div
                  key={section.key}
                  className="flex flex-wrap items-center justify-between gap-3 p-4"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h2 className="text-base font-semibold text-ink">{t(section.labelKey)}</h2>
                      <span
                        className={`rounded-control px-2 py-0.5 text-xs font-semibold ${
                          filled
                            ? "bg-primary/15 text-primary-deep"
                            : "bg-amber-wash text-ink"
                        }`}
                      >
                        {filled
                          ? t("patient.profile.sectionDone")
                          : t("patient.profile.sectionEmpty")}
                      </span>
                    </div>
                    {snippet && (
                      <p className="mt-1 truncate text-sm text-ink-soft">{snippet}</p>
                    )}
                  </div>
                  <Link href={`/profile/${section.key}`} className={BUTTON}>
                    {filled ? t("patient.profile.edit") : t("patient.profile.add")}
                  </Link>
                </div>
              );
            })}
          </section>
        </>
      )}

      <PushOptInCard
        api={api}
        subscribePath="/api/v1/notifications/push-subscriptions/"
      />

      <AccountPanel />
    </div>
  );
}
