import type { ReactNode } from "react";

import { DoctorSessionProvider } from "@/areas/doctor/session";
import { messagesFor } from "@/i18n/catalog";
import { common } from "@/i18n/messages/common";
import { doctor } from "@/i18n/messages/doctor";
import { I18nProvider } from "@/i18n/provider";
import { getLocale } from "@/i18n/server";

export default async function DoctorLayout({ children }: { children: ReactNode }) {
  const locale = await getLocale();
  return (
    <I18nProvider locale={locale} messages={messagesFor(locale, common, doctor)}>
      <DoctorSessionProvider>{children}</DoctorSessionProvider>
    </I18nProvider>
  );
}
