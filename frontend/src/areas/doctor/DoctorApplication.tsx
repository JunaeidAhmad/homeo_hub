"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";

import type { components } from "@/api/schema";
import { FormAlert, Heading, TextField } from "@/components/form/fields";
import { LocationPicker } from "@/components/LocationPicker";
import { formatMoney, numberFormat, parseTakaToPoisha, poishaToTakaInput } from "@/i18n/format";
import type { DoctorMessages } from "@/i18n/messages/doctor";
import { useMessages } from "@/i18n/provider";
import { toAsciiDigits } from "@/lib/digits";

import { CertificatesEditor } from "./CertificatesEditor";
import { useDoctorSession, type DoctorAccount } from "./session";
import { useDoctorSubmit } from "./use-doctor-submit";

type Location = components["schemas"]["Location"];
type DoctorStatus = components["schemas"]["DoctorStatusEnum"];

const STATUS_BADGE: Record<DoctorStatus, string> = {
  PENDING_APPROVAL: "bg-amber-wash text-ink",
  REJECTED: "bg-mist text-danger",
  APPROVED: "bg-primary/15 text-primary-deep",
  SUSPENDED: "bg-mist text-danger",
};

const BUTTON =
  "inline-flex min-h-12 items-center justify-center rounded-control border border-line-strong bg-surface px-5 text-base font-semibold disabled:opacity-60";
const PRIMARY =
  "inline-flex min-h-12 items-center justify-center rounded-control bg-primary px-5 text-base font-bold text-surface disabled:opacity-60";

function ApplicationForm({ doctor }: { doctor: DoctorAccount }) {
  const { locale, t } = useMessages<DoctorMessages>();
  const { api, reloadAccount } = useDoctorSession();
  const { pending, problems, setProblems, submit } = useDoctorSubmit();

  const editable = doctor.status === "PENDING_APPROVAL" || doctor.status === "REJECTED";
  const [fullName, setFullName] = useState(doctor.full_name);
  const [registrationNo, setRegistrationNo] = useState(doctor.registration_no);
  const [qualifications, setQualifications] = useState(doctor.qualifications);
  const [experienceYears, setExperienceYears] = useState(String(doctor.experience_years));
  const [location, setLocation] = useState<Location | null>(doctor.location);
  const [chamberAddress, setChamberAddress] = useState(doctor.chamber_address);
  const [feeTaka, setFeeTaka] = useState(() => poishaToTakaInput(doctor.requested_fee_poisha));
  const [notice, setNotice] = useState<string | null>(null);

  function buildValidatedPayload() {
    const required = t("doctor.error.required");
    const yearsNum = Number(toAsciiDigits(experienceYears).trim());
    const feePoisha = parseTakaToPoisha(feeTaka);

    const fields: Record<string, string> = {};
    if (!fullName.trim()) fields.full_name = required;
    if (!registrationNo.trim()) fields.registration_no = required;
    if (!qualifications.trim()) fields.qualifications = required;
    if (
      !experienceYears.trim() ||
      !Number.isInteger(yearsNum) ||
      yearsNum < 0 ||
      yearsNum > 80
    ) {
      fields.experience_years = t("doctor.error.experienceYears");
    }
    if (!location) fields.location_id = t("doctor.error.location");
    if (!chamberAddress.trim()) fields.chamber_address = required;
    if (feePoisha === null) fields.requested_fee_poisha = t("doctor.error.fee");

    if (Object.keys(fields).length > 0 || !location || feePoisha === null) {
      setProblems({ fields });
      return null;
    }

    return {
      full_name: fullName.trim(),
      registration_no: registrationNo.trim(),
      qualifications: qualifications.trim(),
      experience_years: yearsNum,
      location_id: location.id,
      chamber_address: chamberAddress.trim(),
      requested_fee_poisha: feePoisha,
    };
  }

  function saveDetails(event: FormEvent) {
    event.preventDefault();
    setNotice(null);
    const body = buildValidatedPayload();
    if (!body) return;
    void submit(
      () => api.PATCH("/api/v1/doctor/application/", { body }),
      async () => {
        await reloadAccount();
        setNotice(t("doctor.app.saved"));
      },
    );
  }

  async function resubmit() {
    setNotice(null);
    const body = buildValidatedPayload();
    if (!body) return;
    await submit(
      async () => {
        const patched = await api.PATCH("/api/v1/doctor/application/", { body });
        if (patched.error || !patched.response.ok) return patched;
        return api.POST("/api/v1/doctor/application/resubmit/");
      },
      async () => {
        await reloadAccount();
        setNotice(t("doctor.app.resubmitted"));
      },
    );
  }

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Heading title={t("doctor.app.title")} />
        <span
          className={`rounded-control px-3 py-1 text-sm font-semibold ${STATUS_BADGE[doctor.status]}`}
        >
          {t(`doctor.app.status.${doctor.status}`)}
        </span>
      </div>

      {notice && (
        <p role="status" className="rounded-panel border border-primary/40 bg-mist px-4 py-3 font-medium text-primary-deep">
          {notice}
        </p>
      )}

      {doctor.status === "PENDING_APPROVAL" && (
        <div className="rounded-panel border border-line bg-surface p-5">
          <p className="text-base text-ink-soft">{t("doctor.app.pendingNote")}</p>
        </div>
      )}

      {doctor.status === "REJECTED" && (
        <div className="flex flex-col gap-2 rounded-panel border border-danger/40 bg-amber-wash/50 p-5">
          <p className="font-semibold text-ink">{t("doctor.app.rejectedNote")}</p>
          {doctor.rejection_reason && (
            <div className="text-sm text-ink-soft">
              <span className="font-semibold text-ink">{t("doctor.app.rejectedReason")}: </span>
              {doctor.rejection_reason}
            </div>
          )}
        </div>
      )}

      {doctor.status === "APPROVED" && (
        <div className="flex flex-col gap-3 rounded-panel border border-primary/40 bg-mist p-5">
          <p className="text-base text-ink">{t("doctor.app.approvedNote")}</p>
          <dl className="grid gap-3 pt-1 desktop:grid-cols-2">
            <div>
              <dt className="text-xs font-semibold text-ink-muted">{t("doctor.app.doctorId")}</dt>
              <dd className="font-display text-2xl text-primary-deep">{doctor.doctor_code}</dd>
            </div>
            {doctor.consultation_fee_poisha !== null && (
              <div>
                <dt className="text-xs font-semibold text-ink-muted">{t("doctor.app.approvedFee")}</dt>
                <dd className="font-display text-2xl text-ink">
                  {formatMoney(locale, doctor.consultation_fee_poisha)}
                </dd>
              </div>
            )}
          </dl>
          <div className="pt-2">
            <Link href="/doctor" className={PRIMARY}>
              {t("doctor.app.goQueue")}
            </Link>
          </div>
        </div>
      )}

      <CertificatesEditor
        certificates={doctor.certificates}
        editable={editable}
        onChanged={() => void reloadAccount()}
      />

      {editable ? (
        <form onSubmit={saveDetails} noValidate className="flex flex-col gap-5 rounded-panel border border-line bg-surface p-5">
          <h2 className="text-[16px] font-semibold text-ink">{t("doctor.app.editTitle")}</h2>
          {problems.form && <FormAlert>{problems.form}</FormAlert>}

          <TextField
            label={t("doctor.field.fullName")}
            error={problems.fields.full_name}
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            maxLength={120}
          />
          <TextField
            label={t("doctor.field.registrationNo")}
            error={problems.fields.registration_no}
            value={registrationNo}
            onChange={(event) => setRegistrationNo(event.target.value)}
            maxLength={60}
          />
          <TextField
            label={t("doctor.field.qualifications")}
            hint={t("doctor.field.qualificationsHint")}
            error={problems.fields.qualifications}
            value={qualifications}
            onChange={(event) => setQualifications(event.target.value)}
            maxLength={200}
          />
          <div className="grid gap-5 desktop:grid-cols-2">
            <TextField
              label={t("doctor.field.experienceYears")}
              error={problems.fields.experience_years}
              value={experienceYears}
              onChange={(event) => setExperienceYears(event.target.value)}
              inputMode="numeric"
              maxLength={3}
            />
            <TextField
              label={t("doctor.field.feeTaka")}
              error={problems.fields.requested_fee_poisha}
              value={feeTaka}
              onChange={(event) => setFeeTaka(event.target.value)}
              inputMode="decimal"
              maxLength={12}
            />
          </div>
          <LocationPicker
            label={t("doctor.field.location")}
            value={location}
            onChange={setLocation}
            error={problems.fields.location_id}
          />
          <TextField
            label={t("doctor.field.chamberAddress")}
            error={problems.fields.chamber_address}
            value={chamberAddress}
            onChange={(event) => setChamberAddress(event.target.value)}
            maxLength={255}
          />

          <div className="flex flex-wrap gap-3">
            <button type="submit" disabled={pending} className={BUTTON}>
              {t("doctor.app.saveDetails")}
            </button>
            {doctor.status === "REJECTED" && (
              <button
                type="button"
                disabled={pending}
                onClick={() => void resubmit()}
                className={PRIMARY}
              >
                {t("doctor.app.saveAndResubmit")}
              </button>
            )}
          </div>
        </form>
      ) : (
        <section className="rounded-panel border border-line bg-surface p-5">
          <h2 className="pb-3 text-[16px] font-semibold text-ink">{t("doctor.app.editTitle")}</h2>
          <dl className="grid gap-3 text-sm desktop:grid-cols-2">
            <div>
              <dt className="text-ink-muted">{t("doctor.field.fullName")}</dt>
              <dd className="font-medium">{doctor.full_name}</dd>
            </div>
            <div>
              <dt className="text-ink-muted">{t("doctor.field.registrationNo")}</dt>
              <dd className="font-medium">{doctor.registration_no}</dd>
            </div>
            <div>
              <dt className="text-ink-muted">{t("doctor.field.qualifications")}</dt>
              <dd className="font-medium">{doctor.qualifications}</dd>
            </div>
            <div>
              <dt className="text-ink-muted">{t("doctor.field.experienceYears")}</dt>
              <dd className="font-medium">{numberFormat(locale).format(doctor.experience_years)}</dd>
            </div>
            <div>
              <dt className="text-ink-muted">{t("doctor.field.location")}</dt>
              <dd className="font-medium">{doctor.location.display_name}</dd>
            </div>
            <div>
              <dt className="text-ink-muted">{t("doctor.field.chamberAddress")}</dt>
              <dd className="font-medium">{doctor.chamber_address}</dd>
            </div>
            <div>
              <dt className="text-ink-muted">{t("doctor.app.requestedFee")}</dt>
              <dd className="font-medium">{formatMoney(locale, doctor.requested_fee_poisha)}</dd>
            </div>
          </dl>
        </section>
      )}
    </div>
  );
}

export function DoctorApplication() {
  const session = useDoctorSession();
  if (session.status !== "signedIn") return null;
  // Re-mount form cleanly when status transitions (e.g. RESUBMIT or APPROVED).
  return <ApplicationForm key={`${session.doctor.id}:${session.doctor.status}`} doctor={session.doctor} />;
}
