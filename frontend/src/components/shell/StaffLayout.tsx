import type { ReactNode } from "react";

import { messagesFor, type Catalog } from "@/i18n/catalog";
import { common } from "@/i18n/messages/common";
import { I18nProvider } from "@/i18n/provider";
import { getLocale } from "@/i18n/server";

import { SideNavShell } from "./SideNavShell";

/**
 * Layout for a staff area (doctor, admin): provides that area's messages and wraps
 * pages in the side-navigation shell. Each area passes only its own catalog.
 */
export async function StaffLayout<C extends Catalog>({
  catalog,
  areaNameKey,
  nav,
  children,
}: {
  catalog: C;
  areaNameKey: keyof C["en"] & string;
  nav: readonly { href: string; label: keyof C["en"] & string }[];
  children: ReactNode;
}) {
  const locale = await getLocale();
  const messages = messagesFor(locale, common, catalog);
  return (
    <I18nProvider locale={locale} messages={messages}>
      <SideNavShell
        areaName={messages[areaNameKey]}
        items={nav.map(({ href, label }) => ({ href, label: messages[label] }))}
      >
        {children}
      </SideNavShell>
    </I18nProvider>
  );
}
