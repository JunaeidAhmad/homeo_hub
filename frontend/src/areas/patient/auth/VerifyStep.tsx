"use client";

import { useState, type FormEvent } from "react";

import { useSession } from "@/areas/patient/session/SessionProvider";
import type { AuthMessages } from "@/i18n/messages/auth";
import { useMessages } from "@/i18n/provider";

import { CodeField, isCompleteCode } from "@/components/auth/CodeField";
import { FormAlert, Heading, SubmitBar } from "@/components/form/fields";
import type { PendingCode } from "@/components/auth/pending-code";
import { ResendCode } from "@/components/auth/ResendCode";
import { SentNotice } from "./SentNotice";
import { useSubmit } from "./use-submit";

/** Enter the texted code; success verifies the phone and signs in. */
export function VerifyStep({
  pending: sent,
  onResent,
  onChangeNumber,
  onVerified,
}: {
  pending: PendingCode;
  onResent: (next: PendingCode) => void;
  onChangeNumber: () => void;
  onVerified: () => void;
}) {
  const { t } = useMessages<AuthMessages>();
  const { publicApi, completeSignIn } = useSession();
  const { pending, problems, setProblems, submit } = useSubmit();
  const [code, setCode] = useState("");

  function verify(event: FormEvent) {
    event.preventDefault();
    if (!isCompleteCode(code)) {
      setProblems({ fields: { code: t("auth.error.code") } });
      return;
    }
    void submit(
      () =>
        publicApi.POST("/api/v1/auth/otp/verify/", {
          params: { header: { "X-Client": "web" } },
          body: { verification_id: sent.verificationId, code },
        }),
      async (session) => {
        await completeSignIn(session);
        onVerified();
      },
    );
  }

  return (
    <form onSubmit={verify} noValidate className="flex flex-1 flex-col gap-5">
      <Heading title={t("auth.verify.title")} />
      <SentNotice message="auth.verify.sentTo" phone={sent.phone} onChangeNumber={onChangeNumber} />
      {problems.form && <FormAlert>{problems.form}</FormAlert>}
      <CodeField value={code} onChange={setCode} error={problems.fields.code} />
      <ResendCode pending={sent} publicApi={publicApi} onResent={onResent} />
      <SubmitBar pending={pending}>{t("auth.verify.submit")}</SubmitBar>
    </form>
  );
}
