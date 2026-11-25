import type { Locale } from "./config";

/** Numbers in the digits of the page's language (Bangla digits on Bangla pages). */
export function numberFormat(locale: Locale, options?: Intl.NumberFormatOptions) {
  return new Intl.NumberFormat(locale === "bn" ? "bn-BD" : "en-US", options);
}
