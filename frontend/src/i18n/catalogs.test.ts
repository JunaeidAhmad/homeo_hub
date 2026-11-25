import { describe, expect, it } from "vitest";

import { messagesFor, type Catalog } from "@/i18n/catalog";
import { admin } from "@/i18n/messages/admin";
import { auth } from "@/i18n/messages/auth";
import { common } from "@/i18n/messages/common";
import { doctor } from "@/i18n/messages/doctor";
import { patient } from "@/i18n/messages/patient";

const catalogs: [string, Catalog][] = [
  ["common", common],
  ["patient", patient],
  ["doctor", doctor],
  ["admin", admin],
  ["auth", auth],
];

describe.each(catalogs)("%s messages", (_name, catalog) => {
  it("has Bangla text for every English message, none of it blank", () => {
    for (const key of Object.keys(catalog.en)) {
      expect(catalog.bn[key]?.trim(), key).toBeTruthy();
    }
  });

  it("does not define Bangla messages that English lacks", () => {
    expect(Object.keys(catalog.bn).sort()).toEqual(
      Object.keys(catalog.en).sort(),
    );
  });
});

describe("messagesFor", () => {
  const catalog = {
    en: { greeting: "Hello", farewell: "Goodbye" },
    bn: { greeting: "হ্যালো", farewell: "  " },
  };

  it("uses the requested language", () => {
    expect(messagesFor("bn", catalog).greeting).toBe("হ্যালো");
    expect(messagesFor("en", catalog).greeting).toBe("Hello");
  });

  it("shows English when a Bangla message is blank, never a raw key", () => {
    expect(messagesFor("bn", catalog).farewell).toBe("Goodbye");
  });
});
