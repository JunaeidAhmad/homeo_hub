import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { HealthStatus } from "@/components/HealthStatus";
import { renderIn } from "@/test/render";

describe("HealthStatus", () => {
  it("says the API is ready when every check passes", () => {
    renderIn(
      "en",
      <HealthStatus
        health={{ state: "ok", checks: { database: "ok", redis: "ok" } }}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent("API is ready");
    expect(screen.getByText("Database")).toBeInTheDocument();
    expect(screen.getAllByText("ok")).toHaveLength(2);
  });

  it("names the failing dependency when the API is degraded", () => {
    renderIn(
      "en",
      <HealthStatus
        health={{
          state: "degraded",
          checks: { database: "ok", redis: "error" },
        }}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent("API is degraded");
    expect(screen.getByText("Redis").closest("li")).toHaveTextContent("error");
  });

  it("says the API cannot be reached", () => {
    renderIn("en", <HealthStatus health={{ state: "unreachable" }} />);

    expect(screen.getByRole("status")).toHaveTextContent("API is unreachable");
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("reports in Bangla", () => {
    renderIn(
      "bn",
      <HealthStatus
        health={{ state: "ok", checks: { database: "ok", redis: "ok" } }}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent("এপিআই প্রস্তুত");
    expect(screen.getByText("ডেটাবেস")).toBeInTheDocument();
  });
});
