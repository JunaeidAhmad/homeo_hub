"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";

import { useSession } from "@/areas/patient/session/SessionProvider";
import type { AuthMessages } from "@/i18n/messages/auth";
import { useMessages } from "@/i18n/provider";

import { FormAlert, Heading, SubmitBar, TextField } from "@/components/form/fields";
import { pendingFrom, usePendingCode } from "./pending-code";
import { useForgetOnLeave } from "@/hooks/use-forget-on-leave";
import { useRedirectWhenSignedIn } from "./use-redirect-when-signed-in";
import { useSubmit } from "./use-submit";
import { VerifyStep } from "./VerifyStep";

export function SignInForm() {
  const { t } = useMessages<AuthMessages>();
  const { publicApi, completeSignIn } = useSession();
  const { pending, problems, setProblems, submit } = useSubmit();
  const [sent, setSent] = usePendingCode("signin");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  useForgetOnLeave(() => setPassword(""));
  useRedirectWhenSignedIn();

  function signIn(event: FormEvent) {
    event.preventDefault();
    const required = t("auth.error.required");
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
        publicApi.POST("/api/v1/auth/patient/login/", {
          params: { header: { "X-Client": "web" } },
          body: { phone: phone.trim(), password },
        }),
      async (session) => {
        await completeSignIn(session);
        // Next keeps pages alive after you leave them: do not leave credentials behind.
        setPhone("");
        setPassword("");
      },
      (problem) => {
        if (problem.error?.code !== "PHONE_NOT_VERIFIED") return false;
        // The API has just texted a new code: finish verifying here.
        setPassword("");
        setSent(pendingFrom(problem.error.details as Parameters<typeof pendingFrom>[0]));
        return true;
      },
    );
  }

  if (sent) {
    return (
      <VerifyStep
        pending={sent}
        onResent={setSent}
        onChangeNumber={() => setSent(null)}
        onVerified={() => setSent(null)}
      />
    );
  }

  return (
    <form onSubmit={signIn} noValidate className="flex flex-1 flex-col gap-5">
      <Heading title={t("auth.signin.title")} />
      {problems.form && <FormAlert>{problems.form}</FormAlert>}
      <TextField
        label={t("auth.phone")}
        prefix="+880"
        error={problems.fields.phone}
        value={phone}
        onChange={(event) => setPhone(event.target.value)}
        type="tel"
        autoComplete="tel-national"
      />
      <TextField
        label={t("auth.password")}
        error={problems.fields.password}
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        type="password"
        autoComplete="current-password"
        maxLength={128}
      />
      <Link href="/forgot-password" className="inline-flex min-h-11 items-center self-start font-semibold text-primary">
        {t("auth.forgot")}
      </Link>
      <p className="text-[15px] text-ink-soft">
        {t("auth.noAccount")}{" "}
        <Link href="/signup" className="inline-flex min-h-11 items-center font-semibold text-primary">
          {t("auth.create")}
        </Link>
      </p>
      <SubmitBar pending={pending}>{t("auth.signin")}</SubmitBar>
    </form>
  );
}
