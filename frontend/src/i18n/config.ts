export const LOCALES = ["en", "bn"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

/** Cookie that remembers the visitor's language across visits. */
export const LANGUAGE_COOKIE = "hh_lang";
/** One definition of how the language cookie is stored, shared by the proxy and the browser. */
export const LANGUAGE_COOKIE_OPTIONS = {
  path: "/",
  maxAge: 60 * 60 * 24 * 365, // one year, in seconds
  sameSite: "lax",
} as const;

export function isLocale(value: unknown): value is Locale {
  return (
    typeof value === "string" && (LOCALES as readonly string[]).includes(value)
  );
}
