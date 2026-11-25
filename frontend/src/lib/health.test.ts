import { describe, expect, it } from "vitest";

import { createApiClient } from "@/api/client";
import { getHealth } from "@/lib/health";

function apiReturning(status: number, body: unknown) {
  const requests: Request[] = [];
  const client = createApiClient({
    baseUrl: "http://api.test",
    fetch: async (request: Request) => {
      requests.push(request);
      return new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      });
    },
  });
  return { client, requests };
}

describe("getHealth", () => {
  it("reports ok when the API is ready", async () => {
    const { client, requests } = apiReturning(200, {
      status: "ok",
      checks: { database: "ok", redis: "ok" },
    });

    const health = await getHealth(client);

    expect(requests[0].url).toBe("http://api.test/api/v1/health/ready");
    expect(health).toEqual({
      state: "ok",
      checks: { database: "ok", redis: "ok" },
    });
  });

  it("reports degraded with the failing checks when the API answers 503", async () => {
    const { client } = apiReturning(503, {
      status: "degraded",
      checks: { database: "ok", redis: "error" },
    });

    expect(await getHealth(client)).toEqual({
      state: "degraded",
      checks: { database: "ok", redis: "error" },
    });
  });

  it("reports unreachable when the API cannot be contacted", async () => {
    const client = createApiClient({
      baseUrl: "http://api.test",
      fetch: async () => {
        throw new TypeError("fetch failed");
      },
    });

    expect(await getHealth(client)).toEqual({ state: "unreachable" });
  });

  it("reports unreachable when the API answers something unexpected", async () => {
    const { client } = apiReturning(500, { detail: "boom" });

    expect(await getHealth(client)).toEqual({ state: "unreachable" });
  });
});
