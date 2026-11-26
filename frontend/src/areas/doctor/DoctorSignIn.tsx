"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

import { FormAlert, Heading, SubmitBar, TextField } from "@/components/form/fields";
import { LanguageSwitch } from "@/components/LanguageSwitch";
import { Logo } from "@/components/Logo";
import { useForgetOnLeave } from "@/hooks/use-forget-on-leave";
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
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
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
    if (!login.trim() || !password) {
      setProblems({
        fields: {
          ...(!login.trim() && { login: required }),
          ...(!password && { password: required }),
        },
      });
      return;
    }
    void submit(
      () =>
        session.publicApi.POST("/api/v1/auth/doctor/login/", {
          ...WEB_CLIENT,
          body: { login: login.trim(), password },
        }),
      async (opened) => {
        await session.completeSignIn(opened);
        setLogin("");
        setPassword("");
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
        <form onSubmit={signIn} noValidate className="flex flex-col gap-5">
          <Heading title={t("doctor.signin.title")} />
          {problems.form && <FormAlert>{problems.form}</FormAlert>}
          <TextField
            label={t("doctor.signin.login")}
            hint={t("doctor.signin.loginHint")}
            error={problems.fields.login}
            value={login}
            onChange={(event) => setLogin(event.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={120}
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
      </main>
    </div>
  );
}
