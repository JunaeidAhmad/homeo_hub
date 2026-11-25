import { describe, expect, it } from "vitest";

import { resolveLocale } from "@/i18n/resolve-locale";

describe("resolveLocale", () => {
  it("uses the remembered choice over the browser's language", () => {
    expect(
      resolveLocale({ cookie: "bn", acceptLanguage: "en-US,en;q=0.9" }),
    ).toBe("bn");
    expect(
      resolveLocale({ cookie: "en", acceptLanguage: "bn-BD,bn;q=0.9" }),
    ).toBe("en");
  });

  it("ignores a cookie that is not a supported language", () => {
    expect(resolveLocale({ cookie: "fr", acceptLanguage: "bn" })).toBe("bn");
  });

  it("follows the browser's most preferred supported language on a first visit", () => {
    expect(resolveLocale({ acceptLanguage: "bn-BD,bn;q=0.9,en;q=0.8" })).toBe(
      "bn",
    );
    expect(
      resolveLocale({ acceptLanguage: "fr;q=0.9,en;q=0.5,bn;q=0.8" }),
    ).toBe("bn");
  });

  it("falls back to English when nothing matches", () => {
    expect(resolveLocale({ acceptLanguage: "fr-FR,de;q=0.8" })).toBe("en");
    expect(resolveLocale({})).toBe("en");
  });
});
