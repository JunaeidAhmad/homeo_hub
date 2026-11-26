"use client";

import type { CommonMessages } from "@/i18n/messages/common";
import { useMessages } from "@/i18n/provider";

/** The medical disclaimer at the foot of every page; each page shell renders it. */
export function DisclaimerFooter() {
  const { t } = useMessages<CommonMessages>();
  return (
    <footer className="mx-auto w-full max-w-[820px] px-4 py-4 text-center text-sm leading-relaxed text-ink-muted">
      {t("app.disclaimer")}
    </footer>
  );
}
