import { describe, expect, it } from "vitest";

import { currentHref, isCurrentPath } from "@/lib/nav";

describe("isCurrentPath", () => {
  it("matches a section and its sub-pages, but not look-alike paths", () => {
    expect(isCurrentPath("/care", "/care")).toBe(true);
    expect(isCurrentPath("/care/42", "/care")).toBe(true);
    expect(isCurrentPath("/care-guide", "/care")).toBe(false);
  });

  it("matches the home page only exactly", () => {
    expect(isCurrentPath("/", "/")).toBe(true);
    expect(isCurrentPath("/care", "/")).toBe(false);
  });
});

describe("currentHref", () => {
  const admin = ["/admin", "/admin/doctors", "/admin/orders"];

  it("picks the most specific item when an area's root contains the others", () => {
    expect(currentHref("/admin/doctors", admin)).toBe("/admin/doctors");
    expect(currentHref("/admin/doctors/17", admin)).toBe("/admin/doctors");
    expect(currentHref("/admin", admin)).toBe("/admin");
  });

  it("picks nothing when no item contains the page", () => {
    expect(currentHref("/doctor", admin)).toBeUndefined();
  });
});
