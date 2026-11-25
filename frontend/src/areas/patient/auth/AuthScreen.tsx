"use client";

import type { ReactNode } from "react";

import { LanguageSwitch } from "@/components/LanguageSwitch";
import { Logo } from "@/components/Logo";
import type { AuthMessages } from "@/i18n/messages/auth";
import { useMessages } from "@/i18n/provider";

/**
 * Sign-up, sign-in and password reset: a compact top bar on a phone, with the main
 * action pinned below the form; from 900px an explanatory panel sits beside it.
 */
export function AuthScreen({ children }: { children: ReactNode }) {
  const { t } = useMessages<AuthMessages>();
  return (
    <div className="flex min-h-dvh flex-col bg-surface desktop:flex-row">
      <aside className="hidden w-[420px] flex-none flex-col gap-7 bg-primary-deep p-12 text-surface desktop:flex">
        <p className="font-display text-[34px] leading-tight">{t("auth.side.title")}</p>
        <ul className="flex list-disc flex-col gap-3 pl-5 text-[17px] opacity-90">
          <li>{t("auth.side.area")}</li>
          <li>{t("auth.side.privacy")}</li>
          <li>{t("auth.side.language")}</li>
        </ul>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex min-h-14 items-center justify-between gap-2 border-b border-line pr-2 pl-4">
          <Logo />
          <LanguageSwitch />
        </header>
        <main className="flex w-full flex-1 flex-col px-4 pt-6 desktop:max-w-[640px] desktop:px-14 desktop:py-12">
          {children}
        </main>
      </div>
    </div>
  );
}
