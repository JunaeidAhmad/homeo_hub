import { getLocale } from "@/i18n/server";

import { createApiClient, type ApiClient } from "./client";

/** An API client for Server Components, speaking the language of the page being rendered. */
export async function getApiClient(): Promise<ApiClient> {
  return createApiClient({ language: await getLocale() });
}
