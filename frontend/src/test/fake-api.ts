import { createApiClient } from "@/api/client";
import type { components } from "@/api/schema";
import type { Locale } from "@/i18n/config";

export type Location = components["schemas"]["Location"];

export function area(upazila: string, district: string, division: string, id = upazila): Location {
  return { id, upazila, district, division, display_name: `${upazila}, ${district}, ${division}` };
}

/**
 * A client whose network is a function you control. `requests` records every URL asked for
 * (as a URL object, with the Accept-Language header), so tests assert on what was sent.
 */
export function fakeApi(
  respond: (url: URL) => { status?: number; body: unknown } | Promise<{ status?: number; body: unknown }>,
  language: Locale = "en",
) {
  const requests: { url: URL; language: string | null }[] = [];
  const client = createApiClient({
    language,
    baseUrl: "http://api.test",
    fetch: async (request: Request) => {
      const url = new URL(request.url);
      requests.push({ url, language: request.headers.get("Accept-Language") });
      const { status = 200, body } = await respond(url);
      return new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      });
    },
  });
  return { client, requests };
}

export function page<T>(results: T[], extra: { count?: number } = {}) {
  return { count: extra.count ?? results.length, next: null, previous: null, results };
}
