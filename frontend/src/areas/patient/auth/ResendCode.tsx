"use client";

import { useEffect, useState } from "react";

import { useSession } from "@/areas/patient/session/SessionProvider";
import { fill } from "@/i18n/catalog";
import { numberFormat } from "@/i18n/format";
import type { AuthMessages } from "@/i18n/messages/auth";
import { useMessages } from "@/i18n/provider";

import { FormAlert } from "@/components/form/fields";
import { pendingFrom, type PendingCode } from "./pending-code";
import { useSubmit } from "./use-submit";

/** A countdown, then a button that texts a fresh code. */
export function ResendCode({
  pending,
  onResent,
}: {
  pending: PendingCode;
  onResent: (next: PendingCode) => void;
}) {
  const { t, locale } = useMessages<AuthMessages>();
  const { publicApi } = useSession();
  const { pending: sending, problems, submit } = useSubmit();
  const [now, setNow] = useState(() => Date.now());
  const [resent, setResent] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const secondsLeft = Math.max(0, Math.ceil((pending.resendAt - now) / 1000));
  const minutes = numberFormat(locale).format(Math.floor(secondsLeft / 60));
  const seconds = numberFormat(locale, { minimumIntegerDigits: 2 }).format(secondsLeft % 60);
  const time = `${minutes}:${seconds}`;

  return (
    <div className="flex flex-col items-start gap-2">
      <p role="status" className="text-[15px] font-medium text-primary empty:hidden">
        {resent && t("auth.verify.resent")}
      </p>
      {secondsLeft > 0 ? (
        <p className="text-[15px] text-ink-muted">{fill(t("auth.verify.resendIn"), { time })}</p>
      ) : (
        <button
          type="button"
          disabled={sending}
          onClick={() =>
            void submit(
              () =>
                publicApi.POST("/api/v1/auth/otp/resend/", {
                  body: { verification_id: pending.verificationId },
                }),
              (data) => {
                setResent(true);
                setNow(Date.now());
                onResent(pendingFrom(data));
              },
            )
          }
          className="min-h-11 font-semibold text-primary underline disabled:opacity-60"
        >
          {t("auth.verify.resend")}
        </button>
      )}
      {problems.form && <FormAlert>{problems.form}</FormAlert>}
    </div>
  );
}
