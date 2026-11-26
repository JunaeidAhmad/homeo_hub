"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import type { components } from "@/api/schema";
import { CodeField, isCompleteCode } from "@/components/auth/CodeField";
import { pendingFrom, usePendingCode } from "@/components/auth/pending-code";
import { ResendCode } from "@/components/auth/ResendCode";
import { FormAlert, Heading, SubmitBar, TextField } from "@/components/form/fields";
import { LanguageSwitch } from "@/components/LanguageSwitch";
import { LocationPicker } from "@/components/LocationPicker";
import { Logo } from "@/components/Logo";
import { useForgetOnLeave } from "@/hooks/use-forget-on-leave";
import { fill } from "@/i18n/catalog";
import { parseTakaToPoisha } from "@/i18n/format";
import type { DoctorMessages } from "@/i18n/messages/doctor";
import { useMessages } from "@/i18n/provider";
import { toAsciiDigits } from "@/lib/digits";
import { WEB_CLIENT } from "@/lib/session/auth-session";

import { CertificatesEditor } from "./CertificatesEditor";
import { useDoctorSession } from "./session";
import { useDoctorSubmit } from "./use-doctor-submit";

type Location = components["schemas"]["Location"];
type Step = 1 | 2 | 3;

function Stepper({ step }: { step: Step }) {
  const { t } = useMessages<DoctorMessages>();
  const labels = [
    t("doctor.signup.step1"),
    t("doctor.signup.step2"),
    t("doctor.signup.step3"),
  ];
  return (
    <ol aria-label={t("doctor.signup.steps")} className="flex gap-2">
      {labels.map((label, index) => {
        const num = (index + 1) as Step;
        const active = step === num;
        return (
          <li
            key={label}
            aria-current={active ? "step" : undefined}
            className={`flex-1 rounded-control px-2.5 py-2 text-center text-sm ${
              active ? "bg-mist font-bold text-primary-deep" : "bg-surface text-ink-muted"
            }`}
          >
            {label}
          </li>
        );
      })}
    </ol>
  );
}

export function DoctorSignUp() {
  const { t } = useMessages<DoctorMessages>();
  const session = useDoctorSession();
  const router = useRouter();
  const { pending, problems, setProblems, submit } = useDoctorSubmit();
  const [sent, setSent] = usePendingCode("doctor_signup");
  const [inCertStep, setInCertStep] = useState(false);

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [registrationNo, setRegistrationNo] = useState("");
  const [qualifications, setQualifications] = useState("");
  const [experienceYears, setExperienceYears] = useState("");
  const [location, setLocation] = useState<Location | null>(null);
  const [chamberAddress, setChamberAddress] = useState("");
  const [feeTaka, setFeeTaka] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [certError, setCertError] = useState<string | undefined>();

  useForgetOnLeave(() => setPassword(""));

  const step: Step = inCertStep ? 3 : sent ? 2 : 1;

  function submitDetails(event: FormEvent) {
    event.preventDefault();
    const required = t("doctor.error.required");
    const yearsNum = Number(toAsciiDigits(experienceYears).trim());
    const feePoisha = parseTakaToPoisha(feeTaka);

    const fields: Record<string, string> = {};
    if (!fullName.trim()) fields.full_name = required;
    if (!phone.trim()) fields.phone = required;
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
    if (!password) fields.password = required;

    if (Object.keys(fields).length > 0 || !location || feePoisha === null) {
      setProblems({ fields });
      return;
    }

    void submit(
      () =>
        session.publicApi.POST("/api/v1/auth/doctor/signup/", {
          body: {
            full_name: fullName.trim(),
            phone: phone.trim(),
            registration_no: registrationNo.trim(),
            qualifications: qualifications.trim(),
            experience_years: yearsNum,
            location_id: location.id,
            chamber_address: chamberAddress.trim(),
            requested_fee_poisha: feePoisha,
            password,
          },
        }),
      (data) => {
        setPassword("");
        setSent(pendingFrom(data));
      },
    );
  }

  function submitCode(event: FormEvent) {
    event.preventDefault();
    if (!sent) return;
    if (!isCompleteCode(code)) {
      setProblems({ fields: { code: t("doctor.error.code") } });
      return;
    }
    void submit(
      () =>
        session.publicApi.POST("/api/v1/auth/doctor/verify/", {
          ...WEB_CLIENT,
          body: { verification_id: sent.verificationId, code },
        }),
      async (opened) => {
        await session.completeSignIn(opened);
        setSent(null);
        setCode("");
        setInCertStep(true);
      },
    );
  }

  function finishCertificates() {
    const count = session.status === "signedIn" ? session.doctor.certificates.length : 0;
    if (count === 0) {
      setCertError(t("doctor.certs.needOne"));
      return;
    }
    router.replace("/doctor/application");
  }

  return (
    <div className="flex min-h-dvh flex-col bg-surface">
      <header className="flex min-h-14 items-center justify-between gap-2 border-b border-line pr-2 pl-4">
        <Logo />
        <LanguageSwitch />
      </header>

      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 px-4 py-6 desktop:py-12">
        <Stepper step={step} />

        {step === 1 && (
          <form onSubmit={submitDetails} noValidate className="flex flex-col gap-5">
            <Heading title={t("doctor.signup.title")} note={t("doctor.signup.note")} />
            {problems.form && <FormAlert>{problems.form}</FormAlert>}

            <TextField
              label={t("doctor.field.fullName")}
              error={problems.fields.full_name}
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              autoComplete="name"
              maxLength={120}
            />
            <TextField
              label={t("doctor.field.phone")}
              error={problems.fields.phone}
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              maxLength={24}
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
                hint={t("doctor.field.feeHint")}
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
            <TextField
              label={t("doctor.field.password")}
              hint={t("doctor.field.passwordHint")}
              error={problems.fields.password}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              autoComplete="new-password"
              maxLength={128}
            />

            <SubmitBar pending={pending}>{t("doctor.signup.next")}</SubmitBar>

            <p className="border-t border-line pt-4 text-center text-base text-ink-soft">
              {t("doctor.signup.haveAccount")}{" "}
              <Link href="/doctor/signin" className="font-semibold text-primary underline">
                {t("doctor.signin")}
              </Link>
            </p>
          </form>
        )}

        {step === 2 && sent && (
          <form onSubmit={submitCode} noValidate className="flex flex-col gap-5">
            <Heading title={t("doctor.verify.title")} />
            <div className="flex flex-col items-start">
              <p className="text-base text-ink-soft">
                {fill(t("doctor.verify.sentTo"), { phone: sent.phone })}
              </p>
              <button
                type="button"
                onClick={() => setSent(null)}
                className="min-h-11 font-semibold text-primary underline"
              >
                {t("doctor.verify.change")}
              </button>
            </div>

            {problems.form && <FormAlert>{problems.form}</FormAlert>}
            <CodeField
              label={t("doctor.verify.code")}
              value={code}
              onChange={setCode}
              error={problems.fields.code}
            />
            <ResendCode
              pending={sent}
              publicApi={session.publicApi}
              onResent={setSent}
              errorArea="doctor"
              labels={{
                resent: t("doctor.verify.resent"),
                resendIn: t("doctor.verify.resendIn"),
                resend: t("doctor.verify.resend"),
              }}
            />
            <SubmitBar pending={pending}>{t("doctor.verify.submit")}</SubmitBar>
          </form>
        )}

        {step === 3 && (
          <div className="flex flex-col gap-6">
            <Heading title={t("doctor.certs.title")} note={t("doctor.certs.hint")} />
            {session.status === "signedIn" ? (
              <>
                <CertificatesEditor
                  certificates={session.doctor.certificates}
                  editable
                  error={certError}
                  onChanged={(next) => {
                    setCertError(undefined);
                    if (next.length > 0) void session.reloadAccount();
                    else void session.reloadAccount();
                  }}
                />
                <button
                  type="button"
                  onClick={finishCertificates}
                  className="flex min-h-[54px] items-center justify-center rounded-control bg-primary px-6 text-[17px] font-bold text-surface"
                >
                  {t("doctor.certs.submitApp")}
                </button>
              </>
            ) : (
              <p role="status" className="text-ink-muted">
                {t("doctor.loading")}
              </p>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
