import type { ReactNode } from "react";

import { StaffSessionProvider } from "@/areas/admin/session";
import { messagesFor } from "@/i18n/catalog";
import { admin } from "@/i18n/messages/admin";
import { common } from "@/i18n/messages/common";
import { I18nProvider } from "@/i18n/provider";
import { getLocale } from "@/i18n/server";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const locale = await getLocale();
  return (
    <I18nProvider locale={locale} messages={messagesFor(locale, common, admin)}>
      <StaffSessionProvider>{children}</StaffSessionProvider>
    </I18nProvider>
  );
}
