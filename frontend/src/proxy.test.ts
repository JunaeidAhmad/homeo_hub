// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { proxy } from "@/proxy";

function visit(
  path: string,
  headers: Record<string, string> = {},
  origin = "http://localhost:3000",
) {
  return proxy(new NextRequest(`${origin}${path}`, { headers }));
}

const rewrittenTo = (response: Response) => {
  const target = response.headers.get("x-middleware-rewrite");
  return target ? new URL(target).pathname : null;
};

afterEach(() => vi.unstubAllEnvs());

describe("proxy: API calls", () => {
  it("forwards /api to the API, keeping the trailing slash and query", () => {
    vi.stubEnv("API_BASE_URL", "https://api.example.com/");

    const response = visit("/api/v1/locations/?q=sav&page=2", { cookie: "hh_lang=bn" });

    expect(response.headers.get("x-middleware-rewrite")).toBe(
      "https://api.example.com/api/v1/locations/?q=sav&page=2",
    );
  });

  it("never treats an API call as a page", () => {
    vi.stubEnv("API_BASE_URL", "https://api.example.com");

    const response = visit("/api/v1/auth/refresh/");

    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(response.headers.get("x-middleware-rewrite")).toBe(
      "https://api.example.com/api/v1/auth/refresh/",
    );
  });
});

describe("proxy: telling the API who is visiting", () => {
  const forwarded = (response: Response, header: string) =>
    response.headers.get(`x-middleware-request-${header}`);

  it("names the visitor and proves it is the web app", () => {
    vi.stubEnv("PROXY_SHARED_SECRET", "proxy-secret");

    const response = visit("/api/v1/me/", { "x-forwarded-for": "198.51.100.4, 10.0.0.1" });

    expect(forwarded(response, "x-client-address")).toBe("198.51.100.4");
    expect(forwarded(response, "x-proxy-secret")).toBe("proxy-secret");
  });

  it("never passes on what a browser claims about itself", () => {
    vi.stubEnv("PROXY_SHARED_SECRET", "");

    const response = visit("/api/v1/me/", {
      "x-proxy-secret": "guess",
      "x-client-address": "198.51.100.9",
      accept: "application/json",
    });

    expect(forwarded(response, "x-proxy-secret")).toBeNull();
    expect(forwarded(response, "x-client-address")).toBeNull();
    expect(forwarded(response, "accept")).toBe("application/json");
  });

  it("does not send the secret back to the browser", () => {
    vi.stubEnv("PROXY_SHARED_SECRET", "proxy-secret");

    expect(visit("/care").headers.get("x-middleware-request-x-proxy-secret")).toBeNull();
  });
});

describe("proxy", () => {
  it("removes a trailing slash from page addresses", () => {
    const response = visit("/care/");

    expect(response.status).toBe(308);
    expect(new URL(response.headers.get("location")!).pathname).toBe("/care");
  });

  it("serves the remembered language without changing the visible URL", () => {
    expect(rewrittenTo(visit("/care", { cookie: "hh_lang=bn" }))).toBe(
      "/bn/care",
    );
    expect(rewrittenTo(visit("/", { cookie: "hh_lang=bn" }))).toBe("/bn");
    expect(
      rewrittenTo(visit("/doctor/patients", { cookie: "hh_lang=en" })),
    ).toBe("/en/doctor/patients");
  });

  it("follows the browser's language on a first visit", () => {
    expect(
      rewrittenTo(visit("/admin", { "accept-language": "bn-BD,bn;q=0.9" })),
    ).toBe("/bn/admin");
    expect(rewrittenTo(visit("/admin"))).toBe("/en/admin");
  });

  it("sends a language-prefixed URL back to the clean one and remembers that language", () => {
    const response = visit("/bn/care");

    expect(response.status).toBe(307);
    expect(new URL(response.headers.get("location")!).pathname).toBe("/care");
    expect(response.headers.get("set-cookie")).toMatch(
      /hh_lang=bn;.*Max-Age=31536000/i,
    );
  });

  it("marks the remembered-language cookie Secure on HTTPS only", () => {
    const https = visit("/bn/care", {}, "https://homeohub.example");
    const http = visit("/bn/care");

    expect(https.headers.get("set-cookie")).toMatch(/;\s*secure/i);
    expect(http.headers.get("set-cookie")).not.toMatch(/;\s*secure/i);
  });

  it("does not mistake a path that merely starts with a language code", () => {
    expect(rewrittenTo(visit("/bnx", { cookie: "hh_lang=en" }))).toBe(
      "/en/bnx",
    );
  });
});
