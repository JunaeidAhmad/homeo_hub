import { notFound } from "next/navigation";
import { lang } from "next/root-params";

import { messagesFor, type Catalog, type KeysOf } from "./catalog";
import { isLocale, type Locale } from "./config";

/** The language of the page being rendered (the hidden [lang] segment). */
export async function getLocale(): Promise<Locale> {
  const locale = await lang();
  if (!isLocale(locale)) notFound();
  return locale;
}

/** Translate on the server; the catalogs passed in decide which keys `t` accepts. */
export async function getTranslator<const C extends readonly Catalog[]>(
  ...catalogs: C
) {
  const locale = await getLocale();
  const messages = messagesFor(locale, ...catalogs);
  return {
    locale,
    messages,
    t: (key: KeysOf<C>): string => messages[key] ?? key,
  };
}
