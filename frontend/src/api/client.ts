import createClient, { type ClientOptions } from "openapi-fetch";

import type { Locale } from "@/i18n/config";

import type { paths } from "./schema";

export type ApiClient = ReturnType<typeof createClient<paths>>;

/**
 * Base URL of the Django API (no trailing slash). Set NEXT_PUBLIC_API_BASE_URL on
 * Vercel: it is public because the browser calls the API as well as the server.
 */
export function apiBaseUrl(): string {
  // Written out in full so Next can inline it into browser code.
  return (process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000").replace(/\/+$/, "");
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
