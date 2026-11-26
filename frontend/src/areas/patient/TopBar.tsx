"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Icon } from "@/components/Icon";
import { LanguageSwitch } from "@/components/LanguageSwitch";
import { Logo } from "@/components/Logo";
import { fill } from "@/i18n/catalog";
import { numberFormat } from "@/i18n/format";
import type { CommonMessages } from "@/i18n/messages/common";
import type { PatientMessages } from "@/i18n/messages/patient";
import { useMessages } from "@/i18n/provider";
import { isCurrentPath } from "@/lib/nav";

import { useSession } from "./session/SessionProvider";
import { useCart } from "./cart/CartProvider";
import { PATIENT_TABS } from "./nav";
import { Bell } from "@/components/notifications/Bell";

const CART_ICON =
  "M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4zM3 6h18M16 10a4 4 0 0 1-8 0";
const BACK_ICON = "M15 18l-6-6 6-6";

const iconLink =
  "flex size-11 flex-none items-center justify-center rounded-control text-ink";

/**
 * Patient top bar. On a phone it is compact (logo, language, cart) or, on a task
 * page, a back arrow with the page title. From 900px it also carries the main nav.
 */
export function TopBar({
  task,
}: {
  task?: { title: string; backHref: string };
}) {
  const pathname = usePathname();
  const { locale, t } = useMessages<CommonMessages & PatientMessages>();
  const session = useSession();
  const { cart } = useCart();
  const count = cart?.item_count ?? 0;
  const countText = numberFormat(locale).format(count);
  const cartAriaLabel =
    count > 0 ? fill(t("patient.cart.badgeLabel"), { count: countText }) : t("patient.cart");

  return (
    <header className="sticky top-0 z-20 border-b border-line bg-surface">
      <div className="flex min-h-14 items-center gap-1 pr-2 pl-4 desktop:hidden">
        {task ? (
          <>
            <Link
              href={task.backHref}
              aria-label={t("nav.back")}
              className={`${iconLink} -ml-3`}
            >
              <Icon path={BACK_ICON} strokeWidth={2.2} />
            </Link>
            <span className="min-w-0 flex-1 truncate font-display text-[21px]">
              {task.title}
            </span>
            <LanguageSwitch />
          </>
        ) : (
          <>
            <div className="flex-1">
              <Logo />
            </div>
            <LanguageSwitch />
          </>
        )}
        <Bell
          api={session.api}
          unreadPath="/api/v1/notifications/unread-count/"
          href="/notifications"
          enabled={session.status === "signedIn"}
        />
        <Link href="/cart" aria-label={cartAriaLabel} className={`${iconLink} relative`}>
          <Icon path={CART_ICON} strokeWidth={2} />
          {count > 0 && (
            <span
              aria-hidden="true"
              className="absolute top-0.5 right-0.5 flex min-w-5 items-center justify-center rounded-full bg-amber px-1 text-[11px] leading-5 font-bold text-surface"
            >
              {countText}
            </span>
          )}
        </Link>
      </div>

      <div className="mx-auto hidden min-h-18 max-w-[1200px] items-center gap-8 px-6 desktop:flex">
        <Logo size="lg" />
        <nav
          aria-label={t("nav.main")}
          className="flex flex-1 gap-6 self-stretch"
        >
          {PATIENT_TABS.map((tab) => {
            const on = isCurrentPath(pathname, tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={on ? "page" : undefined}
                className={`flex items-center border-b-[3px] pt-[3px] text-base ${
                  on
                    ? "border-primary font-bold text-ink"
                    : "border-transparent font-medium text-ink-muted hover:text-ink"
                }`}
              >
                {t(tab.label)}
              </Link>
            );
          })}
        </nav>
        <LanguageSwitch />
        <Bell
          api={session.api}
          unreadPath="/api/v1/notifications/unread-count/"
          href="/notifications"
          enabled={session.status === "signedIn"}
        />
        <Link
          href="/cart"
          aria-label={cartAriaLabel}
          className="flex min-h-11 items-center gap-2 rounded-control border border-line-strong px-3.5 text-[15px] font-semibold"
        >
          <Icon path={CART_ICON} size={20} strokeWidth={2} />
          <span>{t("patient.cart")}</span>
          {count > 0 && (
            <span
              aria-hidden="true"
              className="flex min-w-5 items-center justify-center rounded-full bg-amber px-1.5 text-xs leading-5 font-bold text-surface"
            >
              {countText}
            </span>
          )}
        </Link>
      </div>
    </header>
  );
}
