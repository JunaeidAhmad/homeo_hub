"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Icon } from "@/components/Icon";
import type { CommonMessages } from "@/i18n/messages/common";
import type { PatientMessages } from "@/i18n/messages/patient";
import { useMessages } from "@/i18n/provider";
import { isCurrentPath } from "@/lib/nav";

import { PATIENT_TABS } from "./nav";

/** Bottom tab bar for the patient browse pages. Phones only; desktop uses the top bar. */
export function TabBar() {
  const pathname = usePathname();
  const { t } = useMessages<CommonMessages & PatientMessages>();

  return (
    <nav
      aria-label={t("nav.main")}
      className="sticky bottom-0 z-20 grid grid-cols-5 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] desktop:hidden"
    >
      {PATIENT_TABS.map((tab) => {
        const on = isCurrentPath(pathname, tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={on ? "page" : undefined}
            className={`-mt-px flex min-h-15 flex-col items-center justify-center gap-0.5 border-t-[3px] px-1 text-center text-xs leading-tight ${
              on
                ? "border-primary font-bold text-primary-deep"
                : "border-transparent font-medium text-ink-muted"
            }`}
          >
            <Icon path={tab.icon} strokeWidth={on ? 2.4 : 1.8} />
            {t(tab.label)}
          </Link>
        );
      })}
    </nav>
  );
}
