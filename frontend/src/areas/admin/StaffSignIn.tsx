"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

import { FormAlert, Heading, SubmitBar, TextField } from "@/components/form/fields";
import { LanguageSwitch } from "@/components/LanguageSwitch";
import { Logo } from "@/components/Logo";
import { useForgetOnLeave } from "@/hooks/use-forget-on-leave";
import type { AdminMessages } from "@/i18n/messages/admin";
import { useMessages } from "@/i18n/provider";
import { WEB_CLIENT } from "@/lib/session/auth-session";

import { useStaffSession } from "./session";
import { useAdminSubmit } from "./use-admin-submit";

export function StaffSignIn() {
  const { t } = useMessages<AdminMessages>();
  const session = useStaffSession();
  const router = useRouter();
  const { pending, problems, setProblems, submit } = useAdminSubmit();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  useForgetOnLeave(() => setPassword(""));

  const signedIn =
    session.status === "signedIn" || (session.status === "unavailable" && session.hasSession);
  useEffect(() => {
    if (signedIn) router.replace("/admin");
  }, [signedIn, router]);

  function signIn(event: FormEvent) {
    event.preventDefault();
    const required = t("admin.error.required");
    if (!username.trim() || !password) {
      setProblems({
        fields: {
          ...(!username.trim() && { username: required }),
          ...(!password && { password: required }),
        },
      });
      return;
    }
    void submit(
      () =>
        session.publicApi.POST("/api/v1/auth/staff/login/", {
          ...WEB_CLIENT,
          body: { username: username.trim(), password },
        }),
      async (opened) => {
        await session.completeSignIn(opened);
        setUsername("");
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
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 pt-6 desktop:pt-16">
        <form onSubmit={signIn} noValidate className="flex flex-1 flex-col gap-5 desktop:flex-none">
          <Heading title={t("admin.signin.title")} />
          {problems.form && <FormAlert>{problems.form}</FormAlert>}
          <TextField
            label={t("admin.username")}
            error={problems.fields.username}
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={150}
          />
          <TextField
            label={t("admin.password")}
            error={problems.fields.password}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            type="password"
            autoComplete="current-password"
            maxLength={128}
          />
          <SubmitBar pending={pending}>{t("admin.signin")}</SubmitBar>
        </form>
      </main>
    </div>
  );
}
