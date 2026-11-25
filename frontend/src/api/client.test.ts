import { afterEach, describe, expect, it, vi } from "vitest";

import { apiBaseUrl } from "@/api/client";

afterEach(() => vi.unstubAllEnvs());

describe("apiBaseUrl", () => {
  it("is the public NEXT_PUBLIC_API_BASE_URL, without a trailing slash", () => {
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "https://api.example.com/");

    expect(apiBaseUrl()).toBe("https://api.example.com");
  });

  it("is the local API when nothing is set", () => {
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "");
    delete process.env.NEXT_PUBLIC_API_BASE_URL;

    expect(apiBaseUrl()).toBe("http://localhost:8000");
  });
});
