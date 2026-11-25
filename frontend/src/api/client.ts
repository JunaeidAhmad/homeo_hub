import createClient, { type ClientOptions } from "openapi-fetch";

import type { paths } from "./schema";

export type ApiClient = ReturnType<typeof createClient<paths>>;

/** Base URL of the Django API (no trailing slash). Set API_BASE_URL on Vercel. */
export function apiBaseUrl(): string {
  return (process.env.API_BASE_URL ?? "http://localhost:8000").replace(/\/+$/, "");
}

/** A client typed from the OpenAPI schema; regenerate with `npm run api:generate`. */
export function createApiClient(options: ClientOptions = {}): ApiClient {
  return createClient<paths>({ baseUrl: apiBaseUrl(), ...options });
}
