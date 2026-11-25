import {
  LANGUAGE_COOKIE,
  LANGUAGE_COOKIE_OPTIONS,
  type Locale,
} from "./config";

/** Remember the visitor's language across visits (browser only). */
export function rememberLanguage(locale: Locale): void {
  const { path, maxAge, sameSite } = LANGUAGE_COOKIE_OPTIONS;
  const secure = window.location.protocol === "https:" ? "; secure" : "";
  document.cookie = `${LANGUAGE_COOKIE}=${locale}; path=${path}; max-age=${maxAge}; samesite=${sameSite}${secure}`;
}
