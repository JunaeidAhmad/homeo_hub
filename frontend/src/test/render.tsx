import { render } from "@testing-library/react";
import type { ReactElement } from "react";

import { messagesFor } from "@/i18n/catalog";
import type { Locale } from "@/i18n/config";
import { I18nProvider } from "@/i18n/provider";
import { admin } from "@/i18n/messages/admin";
import { common } from "@/i18n/messages/common";
import { doctor } from "@/i18n/messages/doctor";
import { patient } from "@/i18n/messages/patient";

/** Render a component the way an area layout would: one language, all catalogs. */
export function renderIn(locale: Locale, ui: ReactElement) {
  const messages = messagesFor(locale, common, patient, doctor, admin);
  return render(
    <I18nProvider locale={locale} messages={messages}>
      {ui}
    </I18nProvider>,
  );
}
