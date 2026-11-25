import { NextResponse, type NextRequest } from "next/server";

import {
  LANGUAGE_COOKIE,
  LANGUAGE_COOKIE_OPTIONS,
  LOCALES,
} from "@/i18n/config";
import { resolveLocale } from "@/i18n/resolve-locale";

/**
 * Pages live under a hidden `[lang]` segment so both languages prerender
 * statically, but visitors only ever see clean URLs (/, /doctor, /admin).
 * The remembered language (cookie) decides which copy a request is served.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const prefixed = LOCALES.find(
    (locale) => pathname === `/${locale}` || pathname.startsWith(`/${locale}/`),
  );
  if (prefixed) {
    // Someone opened /bn/care directly: show the clean URL and remember the choice.
    const clean = request.nextUrl.clone();
    clean.pathname = pathname.slice(prefixed.length + 1) || "/";
    const response = NextResponse.redirect(clean);
    response.cookies.set(LANGUAGE_COOKIE, prefixed, {
      ...LANGUAGE_COOKIE_OPTIONS,
      secure: request.nextUrl.protocol === "https:",
    });
    return response;
  }

  const locale = resolveLocale({
    cookie: request.cookies.get(LANGUAGE_COOKIE)?.value,
    acceptLanguage: request.headers.get("accept-language") ?? undefined,
  });
  const rewritten = request.nextUrl.clone();
  rewritten.pathname =
    pathname === "/" ? `/${locale}` : `/${locale}${pathname}`;
  const response = NextResponse.rewrite(rewritten);
  // The page differs by language, so shared caches must key on both inputs.
  response.headers.append("Vary", "Cookie, Accept-Language");
  return response;
}

export const config = {
  // Everything except Next internals and files with an extension (favicon, images).
  matcher: ["/((?!_next/|.*\\..*).*)"],
};
