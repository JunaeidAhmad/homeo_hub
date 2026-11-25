"use client";

import type { AuthMessages } from "@/i18n/messages/auth";
import { useMessages } from "@/i18n/provider";
import { toAsciiDigits } from "@/lib/digits";

import { TextField } from "./fields";

export const isCompleteCode = (code: string) => /^\d{6}$/.test(code);

/** One box for the six digits, so a phone can fill it in from the text message. */
export function CodeField({
  value,
  onChange,
  error,
}: {
  value: string;
  onChange: (code: string) => void;
  error?: string;
}) {
  const { t } = useMessages<AuthMessages>();
  return (
    <TextField
      label={t("auth.verify.code")}
      error={error}
      value={value}
      onChange={(event) =>
        onChange(toAsciiDigits(event.target.value).replace(/\D/g, "").slice(0, 6))
      }
      inputMode="numeric"
      autoComplete="one-time-code"
      className="text-center text-[26px]! font-bold tracking-[0.4em]"
    />
  );
}
