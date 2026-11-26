"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";

import type { components } from "@/api/schema";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { FormAlert, Heading, TextField } from "@/components/form/fields";
import { fill } from "@/i18n/catalog";
import type { Locale } from "@/i18n/config";
import { formatMoney, numberFormat, parseTakaToPoisha, poishaToTakaInput } from "@/i18n/format";
import type { AdminMessages } from "@/i18n/messages/admin";
import { useMessages } from "@/i18n/provider";

import { useStaffSession } from "../session";
import { useAdminSubmit } from "../use-admin-submit";

type DoctorDetail = components["schemas"]["AdminDoctorDetail"];
type DoctorStatus = components["schemas"]["DoctorStatusEnum"];

const STATUS_BADGE: Record<DoctorStatus, string> = {
  PENDING_APPROVAL: "bg-amber-wash text-ink",
  APPROVED: "bg-primary/15 text-primary-deep",
  REJECTED: "bg-mist text-danger",
  SUSPENDED: "bg-mist text-danger",
};

const BUTTON =
  "inline-flex min-h-11 items-center justify-center rounded-control border border-line-strong bg-surface px-4 text-sm font-semibold disabled:opacity-60";
const PRIMARY =
  "inline-flex min-h-11 items-center justify-center rounded-control bg-primary px-5 text-sm font-bold text-surface disabled:opacity-60";
const DANGER =
  "inline-flex min-h-11 items-center justify-center rounded-control border border-danger px-4 text-sm font-semibold text-danger disabled:opacity-60";

function formatDateTime(locale: Locale, iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat(locale === "bn" ? "bn-BD" : "en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function DoctorReview({ doctorId }: { doctorId: string }) {
  const { locale, t } = useMessages<AdminMessages>();
  const session = useStaffSession();
  const { api } = session;
  const { pending, problems, setProblems, submit } = useAdminSubmit();

  const [doctor, setDoctor] = useState<DoctorDetail | null>(null);
  const [loadStatus, setLoadStatus] = useState<"loading" | "ready" | "error">("loading");
  const [feeTaka, setFeeTaka] = useState("");
  const [feeNotice, setFeeNotice] = useState(false);

  const [dialogMode, setDialogMode] = useState<"reject" | "suspend" | "reactivate" | null>(null);
  const [reason, setReason] = useState("");
  const [dialogError, setDialogError] = useState<string | undefined>();

  const canManage =
    session.status === "signedIn" && session.staff.permissions.includes("manage_doctors");

  useEffect(() => {
    const controller = new AbortController();
    api
      .GET("/api/v1/admin/doctors/{id}/", {
        params: { path: { id: doctorId } },
        signal: controller.signal,
      })
      .then(({ data }) => {
        if (data) {
          setDoctor(data);
          setFeeTaka(
            poishaToTakaInput(data.consultation_fee_poisha ?? data.requested_fee_poisha),
          );
          setLoadStatus("ready");
        } else {
          setLoadStatus("error");
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoadStatus("error");
      });
    return () => controller.abort();
  }, [api, doctorId]);

  if (loadStatus === "loading") {
    return (
      <p role="status" className="text-ink-muted">
        {t("admin.loading")}
      </p>
    );
  }
  if (loadStatus === "error" || !doctor) {
    return (
      <div className="flex flex-col items-start gap-4">
        <FormAlert>{t("admin.error.generic")}</FormAlert>
        <Link href="/admin/doctors" className={BUTTON}>
          {t("admin.doctors.back")}
        </Link>
      </div>
    );
  }

  function applyUpdated(updated: DoctorDetail) {
    setDoctor(updated);
    setFeeTaka(poishaToTakaInput(updated.consultation_fee_poisha ?? updated.requested_fee_poisha));
    setDialogMode(null);
    setReason("");
    setDialogError(undefined);
  }

  function approveDoctor(event: FormEvent) {
    event.preventDefault();
    const poisha = parseTakaToPoisha(feeTaka);
    if (poisha === null) {
      setProblems({ fields: { consultation_fee_poisha: t("admin.doctors.feeRequired") } });
      return;
    }
    void submit(
      () =>
        api.POST("/api/v1/admin/doctors/{id}/approve/", {
          params: { path: { id: doctorId } },
          body: { consultation_fee_poisha: poisha },
        }),
      applyUpdated,
    );
  }

  function saveFee(event: FormEvent) {
    event.preventDefault();
    setFeeNotice(false);
    const poisha = parseTakaToPoisha(feeTaka);
    if (poisha === null) {
      setProblems({ fields: { consultation_fee_poisha: t("admin.doctors.feeRequired") } });
      return;
    }
    void submit(
      () =>
        api.PATCH("/api/v1/admin/doctors/{id}/", {
          params: { path: { id: doctorId } },
          body: { consultation_fee_poisha: poisha },
        }),
      (updated) => {
        applyUpdated(updated);
        setFeeNotice(true);
      },
    );
  }

  function confirmDialogAction() {
    if (dialogMode === "reject" || dialogMode === "suspend") {
      if (!reason.trim()) {
        setDialogError(t("admin.doctors.reasonRequired"));
        return;
      }
    }
    setDialogError(undefined);

    if (dialogMode === "reject") {
      void submit(
        () =>
          api.POST("/api/v1/admin/doctors/{id}/reject/", {
            params: { path: { id: doctorId } },
            body: { reason: reason.trim() },
          }),
        applyUpdated,
      );
    } else if (dialogMode === "suspend") {
      void submit(
        () =>
          api.POST("/api/v1/admin/doctors/{id}/suspend/", {
            params: { path: { id: doctorId } },
            body: { reason: reason.trim() },
          }),
        applyUpdated,
      );
    } else if (dialogMode === "reactivate") {
      void submit(
        () =>
          api.POST("/api/v1/admin/doctors/{id}/reactivate/", {
            params: { path: { id: doctorId } },
          }),
        applyUpdated,
      );
    }
  }

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div>
        <Link href="/admin/doctors" className="text-sm font-semibold text-primary underline">
          ← {t("admin.doctors.back")}
        </Link>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Heading title={doctor.full_name} />
          {doctor.doctor_code && (
            <p className="font-display text-lg text-primary-deep">{doctor.doctor_code}</p>
          )}
        </div>
        <span
          className={`rounded-control px-3 py-1 text-sm font-semibold ${STATUS_BADGE[doctor.status]}`}
        >
          {t(`admin.doctors.status.${doctor.status}`)}
        </span>
      </div>

      {problems.form && <FormAlert>{problems.form}</FormAlert>}

      <section className="rounded-panel border border-line bg-surface p-5">
        <h2 className="pb-3 text-base font-semibold text-ink">{t("admin.doctors.details")}</h2>
        <dl className="grid gap-3 text-sm desktop:grid-cols-2">
          <div>
            <dt className="text-ink-muted">{t("admin.doctors.phone")}</dt>
            <dd className="font-medium">{doctor.phone}</dd>
          </div>
          <div>
            <dt className="text-ink-muted">{t("admin.doctors.regNo")}</dt>
            <dd className="font-medium">{doctor.registration_no}</dd>
          </div>
          <div>
            <dt className="text-ink-muted">{t("admin.doctors.qualifications")}</dt>
            <dd className="font-medium">{doctor.qualifications}</dd>
          </div>
          <div>
            <dt className="text-ink-muted">{t("admin.doctors.experience")}</dt>
            <dd className="font-medium">
              {fill(t("admin.doctors.experienceValue"), {
                years: numberFormat(locale).format(doctor.experience_years),
              })}
            </dd>
          </div>
          <div>
            <dt className="text-ink-muted">{t("admin.doctors.area")}</dt>
            <dd className="font-medium">{doctor.location.display_name}</dd>
          </div>
          <div>
            <dt className="text-ink-muted">{t("admin.doctors.chamber")}</dt>
            <dd className="font-medium">{doctor.chamber_address}</dd>
          </div>
          <div>
            <dt className="text-ink-muted">{t("admin.doctors.requestedFee")}</dt>
            <dd className="font-medium">{formatMoney(locale, doctor.requested_fee_poisha)}</dd>
          </div>
          {doctor.consultation_fee_poisha !== null && (
            <div>
              <dt className="text-ink-muted">{t("admin.doctors.approvedFee")}</dt>
              <dd className="font-semibold text-primary-deep">
                {formatMoney(locale, doctor.consultation_fee_poisha)}
              </dd>
            </div>
          )}
        </dl>

        {doctor.status === "REJECTED" && doctor.rejection_reason && (
          <div className="mt-4 border-t border-line pt-3 text-sm">
            <p className="font-semibold text-danger">{t("admin.doctors.rejectedReasonLabel")}</p>
            <p className="text-ink-soft">{doctor.rejection_reason}</p>
            {doctor.rejected_by_name && (
              <p className="mt-1 text-xs text-ink-muted">
                {fill(t("admin.doctors.decidedBy"), {
                  by: doctor.rejected_by_name,
                  when: formatDateTime(locale, doctor.rejected_at),
                })}
              </p>
            )}
          </div>
        )}

        {doctor.status === "SUSPENDED" && doctor.suspension_reason && (
          <div className="mt-4 border-t border-line pt-3 text-sm">
            <p className="font-semibold text-danger">{t("admin.doctors.suspendedReasonLabel")}</p>
            <p className="text-ink-soft">{doctor.suspension_reason}</p>
            {doctor.suspended_by_name && (
              <p className="mt-1 text-xs text-ink-muted">
                {fill(t("admin.doctors.decidedBy"), {
                  by: doctor.suspended_by_name,
                  when: formatDateTime(locale, doctor.suspended_at),
                })}
              </p>
            )}
          </div>
        )}
      </section>

      <section className="rounded-panel border border-line bg-surface p-5">
        <h2 className="pb-3 text-base font-semibold text-ink">{t("admin.doctors.certificates")}</h2>
        {doctor.certificates.length === 0 ? (
          <p className="text-sm text-ink-muted">{t("admin.doctors.noCertificates")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {doctor.certificates.map((cert) => (
              <li
                key={cert.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-line px-3.5 py-2.5"
              >
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {cert.original_name}
                </span>
                <a
                  href={cert.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={BUTTON}
                >
                  {t("admin.doctors.viewFile")}
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      {canManage &&
        (doctor.status === "PENDING_APPROVAL" || doctor.status === "REJECTED") && (
          <section className="flex flex-col gap-4 rounded-panel border border-line bg-surface p-5">
            <h2 className="text-base font-semibold text-ink">{t("admin.doctors.approveTitle")}</h2>
            <form onSubmit={approveDoctor} noValidate className="flex flex-col gap-4">
              <TextField
                label={t("admin.doctors.feeLabel")}
                hint={t("admin.doctors.feeHint")}
                error={problems.fields.consultation_fee_poisha}
                value={feeTaka}
                onChange={(event) => setFeeTaka(event.target.value)}
                inputMode="decimal"
                maxLength={12}
              />
              <div className="flex flex-wrap gap-3">
                <button type="submit" disabled={pending} className={PRIMARY}>
                  {t("admin.doctors.approve")}
                </button>
                {doctor.status === "PENDING_APPROVAL" && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => {
                      setReason("");
                      setDialogError(undefined);
                      setDialogMode("reject");
                    }}
                    className={DANGER}
                  >
                    {t("admin.doctors.reject")}
                  </button>
                )}
              </div>
            </form>
          </section>
        )}

      {canManage && doctor.status === "APPROVED" && (
        <section className="flex flex-col gap-4 rounded-panel border border-line bg-surface p-5">
          <h2 className="text-base font-semibold text-ink">{t("admin.doctors.updateFee")}</h2>
          {feeNotice && (
            <p role="status" className="text-sm font-semibold text-primary-deep">
              {t("admin.doctors.feeSaved")}
            </p>
          )}
          <form onSubmit={saveFee} noValidate className="flex flex-col gap-4">
            <TextField
              label={t("admin.doctors.feeLabel")}
              error={problems.fields.consultation_fee_poisha}
              value={feeTaka}
              onChange={(event) => setFeeTaka(event.target.value)}
              inputMode="decimal"
              maxLength={12}
            />
            <div className="flex flex-wrap gap-3">
              <button type="submit" disabled={pending} className={BUTTON}>
                {t("admin.doctors.saveFee")}
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  setReason("");
                  setDialogError(undefined);
                  setDialogMode("suspend");
                }}
                className={DANGER}
              >
                {t("admin.doctors.suspend")}
              </button>
            </div>
          </form>
        </section>
      )}

      {canManage && doctor.status === "SUSPENDED" && (
        <section className="rounded-panel border border-line bg-surface p-5">
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              setDialogError(undefined);
              setDialogMode("reactivate");
            }}
            className={PRIMARY}
          >
            {t("admin.doctors.reactivate")}
          </button>
        </section>
      )}

      <ConfirmDialog
        open={dialogMode !== null}
        title={
          dialogMode === "reject"
            ? t("admin.doctors.reject")
            : dialogMode === "suspend"
              ? t("admin.doctors.suspend")
              : t("admin.doctors.reactivate")
        }
        confirmLabel={
          dialogMode === "reject"
            ? t("admin.doctors.reject")
            : dialogMode === "suspend"
              ? t("admin.doctors.suspend")
              : t("admin.doctors.reactivate")
        }
        cancelLabel={t("admin.doctors.confirmCancel")}
        tone={dialogMode === "reactivate" ? "primary" : "danger"}
        pending={pending}
        error={dialogError ?? problems.form}
        onConfirm={confirmDialogAction}
        onClose={() => setDialogMode(null)}
      >
        {(dialogMode === "reject" || dialogMode === "suspend") && (
          <TextField
            label={
              dialogMode === "reject"
                ? t("admin.doctors.rejectReason")
                : t("admin.doctors.suspendReason")
            }
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={500}
          />
        )}
      </ConfirmDialog>
    </div>
  );
}
