// @vitest-environment node
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

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

describe("proxy", () => {
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
