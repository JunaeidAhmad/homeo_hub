"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";

import { useSession } from "@/areas/patient/session/SessionProvider";
import type { AuthMessages } from "@/i18n/messages/auth";
import { useMessages } from "@/i18n/provider";

import { CodeField, isCompleteCode } from "./CodeField";
import { FormAlert, Heading, SubmitBar, TextField } from "./fields";
import { pendingFrom, usePendingCode } from "./pending-code";
import { ResendCode } from "./ResendCode";
import { SentNotice } from "./SentNotice";
import { useForgetOnLeave } from "./use-forget-on-leave";
import { useSubmit } from "./use-submit";

export function ForgotPasswordForm() {
  const { t } = useMessages<AuthMessages>();
  const { publicApi } = useSession();
  const { pending, problems, setProblems, submit } = useSubmit();
  const [sent, setSent] = usePendingCode("reset");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [done, setDone] = useState(false);
  useForgetOnLeave(() => {
    setPhone("");
    setPassword("");
    setCode("");
    setDone(false);
  });

  function askForCode(event: FormEvent) {
    event.preventDefault();
    if (!phone.trim()) {
      setProblems({ fields: { phone: t("auth.error.required") } });
      return;
    }
    void submit(
      () => publicApi.POST("/api/v1/auth/password/forgot/", { body: { phone: phone.trim() } }),
      (data) => setSent(pendingFrom(data)),
    );
  }

  function change(event: FormEvent, verificationId: string) {
    event.preventDefault();
    const missing: Record<string, string> = {};
    if (!isCompleteCode(code)) missing.code = t("auth.error.code");
    if (!password) missing.new_password = t("auth.error.required");
    if (Object.keys(missing).length > 0) {
      setProblems({ fields: missing });
      return;
    }
    void submit(
      () =>
        publicApi.POST("/api/v1/auth/password/reset/", {
          body: { verification_id: verificationId, code, new_password: password },
        }),
      () => {
        setDone(true);
        setPassword("");
        setCode("");
        setSent(null);
      },
    );
  }

  if (done) {
    return (
      <div className="flex flex-1 flex-col gap-5">
        <Heading title={t("auth.reset.title")} />
        <p role="status" className="text-base">
          {t("auth.reset.done")}
        </p>
        <Link
          href="/signin"
          className="flex min-h-[54px] items-center justify-center rounded-control bg-primary text-[17px] font-bold text-surface"
        >
          {t("auth.signin")}
        </Link>
      </div>
    );
  }

  if (sent) {
    return (
      <form
        onSubmit={(event) => change(event, sent.verificationId)}
        noValidate
        className="flex flex-1 flex-col gap-5"
      >
        <Heading title={t("auth.reset.title")} />
        <SentNotice
          message="auth.reset.sentIfKnown"
          phone={sent.phone}
          onChangeNumber={() => setSent(null)}
        />
        {problems.form && <FormAlert>{problems.form}</FormAlert>}
        <CodeField value={code} onChange={setCode} error={problems.fields.code} />
        <TextField
          label={t("auth.password.new")}
          hint={t("auth.password.hint")}
          error={problems.fields.new_password}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          type="password"
          autoComplete="new-password"
          maxLength={128}
        />
        <ResendCode pending={sent} onResent={setSent} />
        <SubmitBar pending={pending}>{t("auth.reset.submit")}</SubmitBar>
      </form>
    );
  }

  return (
    <form onSubmit={askForCode} noValidate className="flex flex-1 flex-col gap-5">
      <Heading title={t("auth.reset.title")} note={t("auth.reset.note")} />
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
      <SubmitBar pending={pending}>{t("auth.reset.send")}</SubmitBar>
    </form>
  );
}
