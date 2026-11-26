import type { ReactNode } from "react";

import { CartProvider } from "@/areas/patient/cart/CartProvider";
import { SessionProvider } from "@/areas/patient/session/SessionProvider";
import { messagesFor } from "@/i18n/catalog";
import { auth } from "@/i18n/messages/auth";
import { common } from "@/i18n/messages/common";
import { patient } from "@/i18n/messages/patient";
import { I18nProvider } from "@/i18n/provider";
import { getLocale } from "@/i18n/server";

export default async function PatientLayout({ children }: { children: ReactNode }) {
  const locale = await getLocale();
  return (
    <I18nProvider locale={locale} messages={messagesFor(locale, common, patient, auth)}>
      <SessionProvider>
        <CartProvider>{children}</CartProvider>
      </SessionProvider>
    </I18nProvider>
  );
}
