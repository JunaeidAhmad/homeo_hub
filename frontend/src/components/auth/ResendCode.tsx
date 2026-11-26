"use client";

import { useEffect, useState } from "react";

import type { ApiClient } from "@/api/client";
import { FormAlert } from "@/components/form/fields";
import { useDescribeErrorWith } from "@/hooks/use-describe-error";
import { useSubmitWith } from "@/hooks/use-submit";
import { fill } from "@/i18n/catalog";
import { numberFormat } from "@/i18n/format";
import { useMessages } from "@/i18n/provider";

import { pendingFrom, type PendingCode } from "./pending-code";

export type ResendLabels = {
  resent: string;
  resendIn: string;
  resend: string;
};

/** A countdown, then a button that texts a fresh code. */
export function ResendCode({
  pending,
  publicApi,
  onResent,
  errorArea = "auth",
  labels,
}: {
  pending: PendingCode;
  publicApi: ApiClient;
  onResent: (next: PendingCode) => void;
  errorArea?: string;
  labels?: ResendLabels;
}) {
  const { t, locale } = useMessages();
  const describe = useDescribeErrorWith(errorArea);
  const { pending: sending, problems, submit } = useSubmitWith(describe);
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

  const copy: ResendLabels = labels ?? {
    resent: t("auth.verify.resent"),
    resendIn: t("auth.verify.resendIn"),
    resend: t("auth.verify.resend"),
  };

  return (
    <div className="flex flex-col items-start gap-2">
      <p role="status" className="text-[15px] font-medium text-primary empty:hidden">
        {resent && copy.resent}
      </p>
      {secondsLeft > 0 ? (
        <p className="text-[15px] text-ink-muted">{fill(copy.resendIn, { time })}</p>
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
          {copy.resend}
        </button>
      )}
      {problems.form && <FormAlert>{problems.form}</FormAlert>}
    </div>
  );
}
