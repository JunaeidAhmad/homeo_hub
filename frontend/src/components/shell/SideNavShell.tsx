"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";

import { DisclaimerFooter } from "@/components/DisclaimerFooter";
import { Icon } from "@/components/Icon";
import { LanguageSwitch } from "@/components/LanguageSwitch";
import { Logo } from "@/components/Logo";
import type { CommonMessages } from "@/i18n/messages/common";
import { useMessages } from "@/i18n/provider";
import { currentHref } from "@/lib/nav";

export type SideNavItem = { href: string; label: string };

const MENU_ICON = "M4 6h16M4 12h16M4 18h16";

/**
 * Shell for the staff areas (doctor, admin). On a phone: a top bar whose Menu
 * button opens the navigation. From 900px: a fixed side navigation.
 */
export function SideNavShell({
  areaName,
  items,
  headerActions,
  footer,
  children,
}: {
  areaName: string;
  items: SideNavItem[];
  headerActions?: ReactNode;
  /** Shown under the navigation, e.g. who is signed in. */
  footer?: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const { t } = useMessages<CommonMessages>();
  // The menu is open for one page only (browser back/forward changes the path and
  // closes it); choosing an item or pressing Escape closes it too.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;
  const close = () => setOpenOn(null);
  // "/admin" contains "/admin/doctors": only the most specific item is current.
  const current = currentHref(
    pathname,
    items.map((item) => item.href),
  );

  return (
    <div className="min-h-dvh desktop:grid desktop:grid-cols-[16rem_1fr]">
      <div
        onKeyDown={(event) => event.key === "Escape" && close()}
        className="sticky top-0 z-30 border-b border-line bg-surface desktop:static desktop:flex desktop:h-dvh desktop:flex-col desktop:border-r desktop:border-b-0"
      >
        <div className="flex min-h-14 items-center gap-2 pr-2 pl-2 desktop:min-h-18 desktop:px-4">
          <button
            type="button"
            aria-expanded={open}
            aria-controls="side-nav"
            aria-label={t("nav.menu")}
            onClick={() => setOpenOn(open ? null : pathname)}
            className="flex size-11 items-center justify-center rounded-control text-ink desktop:hidden"
          >
            <Icon path={MENU_ICON} strokeWidth={2.2} />
          </button>
          <div className="hidden desktop:block">
            <Logo />
          </div>
          <span className="min-w-0 flex-1 truncate font-display text-xl">
            {areaName}
          </span>
          {headerActions}
          <div className="desktop:hidden">
            <LanguageSwitch />
          </div>
        </div>

        <nav
          id="side-nav"
          aria-label={areaName}
          className={`${open ? "block" : "hidden"} max-h-[calc(100dvh-3.5rem)] overflow-y-auto border-t border-line p-2 desktop:block desktop:max-h-none desktop:flex-1 desktop:border-t-0 desktop:p-3`}
        >
          <ul className="flex flex-col gap-1">
            {items.map((item) => {
              const on = item.href === current;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={on ? "page" : undefined}
                    onClick={close}
                    className={`flex min-h-11 items-center rounded-control px-3 text-base ${
                      on
                        ? "bg-mist font-bold text-primary-deep"
                        : "font-medium text-ink-muted hover:bg-mist/60 hover:text-ink"
                    }`}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
          {footer}
        </nav>

        <div className="hidden border-t border-line p-4 desktop:block">
          <LanguageSwitch />
        </div>
      </div>

      <div className="flex min-w-0 flex-col">
        <main className="mx-auto w-full max-w-[1100px] flex-1 px-4 py-6 desktop:px-8 desktop:py-10">
          {children}
        </main>
        <DisclaimerFooter />
      </div>
    </div>
  );
}
