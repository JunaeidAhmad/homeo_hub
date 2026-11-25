import { NextResponse, type NextRequest } from "next/server";

import {
  LANGUAGE_COOKIE,
  LANGUAGE_COOKIE_OPTIONS,
  LOCALES,
} from "@/i18n/config";
import { resolveLocale } from "@/i18n/resolve-locale";
import { serverApiBaseUrl } from "@/api/base-url";

/**
 * The API sees this server, not the visitor, so say who the visitor is and prove it with
 * the shared secret (the API's rate limits rely on it). Anything the browser claimed in
 * these headers is dropped. Vercel sets x-forwarded-for itself, so it can be trusted.
 */
function forwardedHeaders(request: NextRequest): Headers {
  const headers = new Headers(request.headers);
  headers.delete("x-proxy-secret");
  headers.delete("x-client-address");
  const secret = process.env.PROXY_SHARED_SECRET;
  const visitor = headers.get("x-forwarded-for")?.split(",")[0].trim();
  if (secret && visitor) {
    headers.set("x-proxy-secret", secret);
    headers.set("x-client-address", visitor);
  }
  return headers;
}

/**
 * Pages live under a hidden `[lang]` segment so both languages prerender
 * statically, but visitors only ever see clean URLs (/, /doctor, /admin).
 * The remembered language (cookie) decides which copy a request is served.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = new URL(request.url);

  // The browser calls the API on this app's own address, which keeps the session cookie
  // first-party (the API lives on another site). Django needs the trailing slash kept.
  if (pathname.startsWith("/api/")) {
    return NextResponse.rewrite(new URL(`${serverApiBaseUrl()}${pathname}${search}`), {
      request: { headers: forwardedHeaders(request) },
    });
  }

  // Next's own trailing-slash redirect is off (for the API), so do it here for pages.
  if (pathname !== "/" && pathname.endsWith("/")) {
    const clean = new URL(request.url);
    clean.pathname = pathname.replace(/\/+$/, "") || "/";
    return NextResponse.redirect(clean, 308);
  }

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
  // All API calls, and every page: not Next internals or files with an extension.
  matcher: ["/api/:path*", "/((?!_next/|.*\\..*).*)"],
};
