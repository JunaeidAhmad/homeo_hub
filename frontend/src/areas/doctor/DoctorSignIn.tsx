"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

import { CodeField, isCompleteCode } from "@/components/auth/CodeField";
import { pendingFrom, usePendingCode } from "@/components/auth/pending-code";
import { ResendCode } from "@/components/auth/ResendCode";
import { DisclaimerFooter } from "@/components/DisclaimerFooter";
import { FormAlert, Heading, SubmitBar, TextField } from "@/components/form/fields";
import { LanguageSwitch } from "@/components/LanguageSwitch";
import { Logo } from "@/components/Logo";
import { useForgetOnLeave } from "@/hooks/use-forget-on-leave";
import { fill } from "@/i18n/catalog";
import type { DoctorMessages } from "@/i18n/messages/doctor";
import { useMessages } from "@/i18n/provider";
import { WEB_CLIENT } from "@/lib/session/auth-session";

import { useDoctorSession } from "./session";
import { useDoctorSubmit } from "./use-doctor-submit";

export function DoctorSignIn() {
  const { t } = useMessages<DoctorMessages>();
  const session = useDoctorSession();
  const router = useRouter();
  const { pending, problems, setProblems, submit } = useDoctorSubmit();
  const [sent, setSent] = usePendingCode("doctor_signin");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  useForgetOnLeave(() => setPassword(""));

  const destination =
    session.status === "signedIn"
      ? session.doctor.status === "APPROVED"
        ? "/doctor"
        : "/doctor/application"
      : null;

  useEffect(() => {
    if (destination) router.replace(destination);
  }, [destination, router]);

  function signIn(event: FormEvent) {
    event.preventDefault();
    const required = t("doctor.error.required");
    if (!phone.trim() || !password) {
      setProblems({
        fields: {
          ...(!phone.trim() && { phone: required }),
          ...(!password && { password: required }),
        },
      });
      return;
    }
    void submit(
      () =>
        session.publicApi.POST("/api/v1/auth/doctor/login/", {
          ...WEB_CLIENT,
          body: { phone: phone.trim(), password },
        }),
      async (opened) => {
        await session.completeSignIn(opened);
        setPhone("");
        setPassword("");
      },
      (problem) => {
        if (problem.error?.code !== "PHONE_NOT_VERIFIED") return false;
        // The API has just texted a new code: finish verifying here.
        setPassword("");
        setCode("");
        setSent(pendingFrom(problem.error.details as Parameters<typeof pendingFrom>[0]));
        return true;
      },
    );
  }

  function verify(event: FormEvent) {
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
        setPhone("");
        setCode("");
      },
    );
  }

  return (
    <div className="flex min-h-dvh flex-col bg-surface">
      <header className="flex min-h-14 items-center justify-between gap-2 border-b border-line pr-2 pl-4">
        <Logo />
        <LanguageSwitch />
      </header>
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 pt-6 desktop:pt-16">
        {sent ? (
          <form onSubmit={verify} noValidate className="flex flex-col gap-5">
            <Heading title={t("doctor.verify.title")} />
            <div className="flex flex-col items-start">
              <p className="text-base text-ink-soft">
                {fill(t("doctor.verify.sentTo"), { phone: sent.phone })}
              </p>
              <button
                type="button"
                onClick={() => {
                  setProblems({ fields: {} });
                  setSent(null);
                }}
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
        ) : (
          <>
            <form onSubmit={signIn} noValidate className="flex flex-col gap-5">
              <Heading title={t("doctor.signin.title")} />
              {problems.form && <FormAlert>{problems.form}</FormAlert>}
              <TextField
                label={t("doctor.field.phone")}
                prefix="+880"
                error={problems.fields.phone}
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                type="tel"
                autoComplete="tel-national"
              />
              <TextField
                label={t("doctor.signin.password")}
                error={problems.fields.password}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                type="password"
                autoComplete="current-password"
                maxLength={128}
              />
              <SubmitBar pending={pending}>{t("doctor.signin")}</SubmitBar>
            </form>

            <p className="border-t border-line pt-4 text-center text-base text-ink-soft">
              {t("doctor.signin.noAccount")}{" "}
              <Link href="/doctor/signup" className="font-semibold text-primary underline">
                {t("doctor.signin.apply")}
              </Link>
            </p>
          </>
        )}
      </main>
      <DisclaimerFooter />
    </div>
  );
}
