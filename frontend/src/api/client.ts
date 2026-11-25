import createClient, { type ClientOptions } from "openapi-fetch";

import type { Locale } from "@/i18n/config";

import { serverApiBaseUrl } from "./base-url";
import type { paths } from "./schema";

export type ApiClient = ReturnType<typeof createClient<paths>>;

/**
 * Where to send API requests. In the browser: this app's own address, which src/proxy.ts
 * forwards to the API (so the session cookie is first-party). On the server: directly.
 */
export function apiBaseUrl(): string {
  return typeof window === "undefined" ? serverApiBaseUrl() : window.location.origin;
}

/**
 * A client typed from the OpenAPI schema; regenerate with `npm run api:generate`.
 * `language` is required so every request tells the API which language to answer in.
 */
export function createApiClient({
  language,
  headers,
  ...options
}: ClientOptions & { language: Locale }): ApiClient {
  return createClient<paths>({
    baseUrl: apiBaseUrl(),
    ...options,
    headers: { ...headers, "Accept-Language": language },
  });
}
