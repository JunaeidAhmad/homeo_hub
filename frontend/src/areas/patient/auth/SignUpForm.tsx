"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";

import type { components } from "@/api/schema";
import { useSession } from "@/areas/patient/session/SessionProvider";
import { LocationPicker } from "@/components/LocationPicker";
import type { AuthMessages } from "@/i18n/messages/auth";
import { useMessages } from "@/i18n/provider";
import { toAsciiDigits } from "@/lib/digits";

import { FormAlert, Heading, SegmentedChoice, SubmitBar, TextField } from "./fields";
import { pendingFrom, usePendingCode } from "./pending-code";
import { useForgetOnLeave } from "./use-forget-on-leave";
import { useRedirectWhenSignedIn } from "./use-redirect-when-signed-in";
import { useSubmit } from "./use-submit";
import { VerifyStep } from "./VerifyStep";

type Gender = components["schemas"]["GenderEnum"];
type Location = components["schemas"]["Location"];

const GENDERS: Gender[] = ["FEMALE", "MALE", "OTHER"];

function Steps({ current }: { current: 1 | 2 }) {
  const { t } = useMessages<AuthMessages>();
  return (
    <ol aria-label={t("auth.steps")} className="grid grid-cols-2 gap-1.5">
      {([1, 2] as const).map((step) => (
        <li
          key={step}
          aria-current={step === current ? "step" : undefined}
          className={`flex flex-col gap-1.5 text-sm font-semibold ${
            step === current ? "text-ink" : "text-ink-muted"
          }`}
        >
          <span className={`h-1 rounded-sm ${step <= current ? "bg-primary" : "bg-line"}`} />
          {t(step === 1 ? "auth.step.details" : "auth.step.verify")}
        </li>
      ))}
    </ol>
  );
}

export function SignUpForm() {
  // A new round remounts the form, so nothing typed by the last person survives.
  const [round, setRound] = useState(0);
  return <SignUpRound key={round} onVerified={() => setRound((n) => n + 1)} />;
}

function SignUpRound({ onVerified }: { onVerified: () => void }) {
  const { t } = useMessages<AuthMessages>();
  const { publicApi } = useSession();
  const { pending, problems, setProblems, submit } = useSubmit();
  const [sent, setSent] = usePendingCode("signup");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [age, setAge] = useState("");
  const [gender, setGender] = useState<Gender | null>(null);
  const [area, setArea] = useState<Location | null>(null);
  const [password, setPassword] = useState("");
  useForgetOnLeave(() => setPassword(""));
  useRedirectWhenSignedIn();

  function send(event: FormEvent) {
    event.preventDefault();
    const years = Number(toAsciiDigits(age.trim()));
    const missing: Record<string, string> = {};
    const required = t("auth.error.required");
    if (!fullName.trim()) missing.full_name = required;
    if (!phone.trim()) missing.phone = required;
    if (!Number.isInteger(years) || years < 1 || years > 120) missing.age = t("auth.error.age");
    if (!gender) missing.gender = required;
    if (!area) missing.location_id = t("auth.error.location");
    if (!password) missing.password = required;
    if (Object.keys(missing).length > 0 || !gender || !area) {
      setProblems({ fields: missing });
      return;
    }
    void submit(
      () =>
        publicApi.POST("/api/v1/auth/patient/signup/", {
          body: {
            full_name: fullName.trim(),
            phone: phone.trim(),
            age: years,
            gender,
            location_id: area.id,
            password,
          },
        }),
      (data) => {
        setPassword("");
        setSent(pendingFrom(data));
      },
    );
  }

  if (sent) {
    return (
      <div className="flex flex-1 flex-col gap-5">
        <Steps current={2} />
        <VerifyStep
          pending={sent}
          onResent={setSent}
          onChangeNumber={() => setSent(null)}
          onVerified={() => {
            setSent(null);
            onVerified();
          }}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-5">
      <Steps current={1} />
      <form onSubmit={send} noValidate className="flex flex-1 flex-col gap-5">
        <Heading title={t("auth.signup.title")} note={t("auth.signup.note")} />
        {problems.form && (
          <FormAlert>
            {problems.form}{" "}
            {problems.code === "PHONE_TAKEN" && (
              <Link
                href="/signin"
                className="inline-flex min-h-11 items-center font-bold text-primary underline"
              >
                {t("auth.signin")}
              </Link>
            )}
          </FormAlert>
        )}
        <TextField
          label={t("auth.name")}
          error={problems.fields.full_name}
          value={fullName}
          onChange={(event) => setFullName(event.target.value)}
          autoComplete="name"
          maxLength={120}
        />
        <TextField
          label={t("auth.phone")}
          prefix="+880"
          error={problems.fields.phone}
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          type="tel"
          autoComplete="tel-national"
        />
        <div className="grid grid-cols-[6rem_minmax(0,1fr)] items-start gap-3">
          <TextField
            label={t("auth.age")}
            error={problems.fields.age}
            value={age}
            onChange={(event) => setAge(event.target.value)}
            inputMode="numeric"
            maxLength={3}
          />
          <SegmentedChoice
            legend={t("auth.gender")}
            name="gender"
            options={GENDERS.map((value) => ({ value, label: t(`auth.gender.${value}`) }))}
            value={gender}
            onChange={setGender}
            error={problems.fields.gender}
          />
        </div>
        <LocationPicker
          client={publicApi}
          value={area}
          onChange={setArea}
          error={problems.fields.location_id}
        />
        <TextField
          label={t("auth.password")}
          hint={t("auth.password.hint")}
          error={problems.fields.password}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          type="password"
          autoComplete="new-password"
          maxLength={128}
        />
        <p className="text-[15px] text-ink-soft">
          {t("auth.haveAccount")}{" "}
          <Link href="/signin" className="inline-flex min-h-11 items-center font-semibold text-primary">
            {t("auth.signin")}
          </Link>
        </p>
        <SubmitBar pending={pending}>{t("auth.signup.submit")}</SubmitBar>
      </form>
    </div>
  );
}
