import { DEFAULT_LOCALE, isLocale, type Locale } from "./config";

/** The best supported language in an Accept-Language header (q-values honoured). */
function fromAcceptLanguage(header: string): Locale | undefined {
  return header
    .split(",")
    .map((part, index) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params.find((p) => p.trim().startsWith("q="));
      return {
        language: tag.trim().toLowerCase().split("-")[0],
        q: q ? Number(q.trim().slice(2)) : 1,
        index,
      };
    })
    .filter(({ q }) => q > 0)
    .sort((a, b) => b.q - a.q || a.index - b.index)
    .map(({ language }) => language)
    .find(isLocale);
}

/** Remembered choice first, then the browser's language, then English. */
export function resolveLocale({
  cookie,
  acceptLanguage,
}: {
  cookie?: string;
  acceptLanguage?: string;
}): Locale {
  if (isLocale(cookie)) return cookie;
  return (
    (acceptLanguage && fromAcceptLanguage(acceptLanguage)) || DEFAULT_LOCALE
  );
}
