"use client";

import { fill } from "@/i18n/catalog";
import type { AuthMessages } from "@/i18n/messages/auth";
import { useMessages } from "@/i18n/provider";

/** Where the code went, with a way back to change the number. */
export function SentNotice({
  message,
  phone,
  onChangeNumber,
}: {
  message: "auth.verify.sentTo" | "auth.reset.sentIfKnown";
  phone: string;
  onChangeNumber: () => void;
}) {
  const { t } = useMessages<AuthMessages>();
  return (
    <div className="flex flex-col items-start">
      <p className="text-base text-ink-soft">{fill(t(message), { phone })}</p>
      <button
        type="button"
        onClick={onChangeNumber}
        className="min-h-11 font-semibold text-primary underline"
      >
        {t("auth.verify.change")}
      </button>
    </div>
  );
}
