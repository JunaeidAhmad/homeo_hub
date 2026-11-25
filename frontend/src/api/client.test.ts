import { afterEach, describe, expect, it, vi } from "vitest";

import { apiBaseUrl } from "@/api/client";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("apiBaseUrl", () => {
  it("is the web app's own address in the browser, so the session cookie is first-party", () => {
    vi.stubEnv("API_BASE_URL", "https://api.example.com");

    expect(apiBaseUrl()).toBe(window.location.origin);
  });

  it("is API_BASE_URL on the server, without a trailing slash", () => {
    vi.stubGlobal("window", undefined);
    vi.stubEnv("API_BASE_URL", "https://api.example.com/");

    expect(apiBaseUrl()).toBe("https://api.example.com");
  });

  it("is the local API on the server when nothing is set", () => {
    vi.stubGlobal("window", undefined);
    delete process.env.API_BASE_URL;

    expect(apiBaseUrl()).toBe("http://localhost:8000");
  });
});
