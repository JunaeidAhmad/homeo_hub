import type { ApiClient } from "@/api/client";
import type { components } from "@/api/schema";

type ReadyChecks = components["schemas"]["ReadyChecks"];

export type Health =
  | { state: "ok"; checks: ReadyChecks }
  | { state: "degraded"; checks: ReadyChecks }
  | { state: "unreachable" };

/** Ask the API whether it is ready to serve traffic. Never throws. */
export async function getHealth(client: ApiClient): Promise<Health> {
  try {
    const { data, error, response } = await client.GET("/api/v1/health/ready", {
      cache: "no-store",
    });
    if (data) return { state: "ok", checks: data.checks };
    if (response.status === 503 && error?.checks) {
      return { state: "degraded", checks: error.checks };
    }
  } catch {
    // Network failure, DNS, refused connection, invalid JSON: all mean "can't reach it".
  }
  return { state: "unreachable" };
}
