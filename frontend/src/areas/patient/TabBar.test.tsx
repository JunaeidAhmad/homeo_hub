import { screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TabBar } from "@/areas/patient/TabBar";
import { renderIn } from "@/test/render";

let currentPath = "/";
vi.mock("next/navigation", () => ({ usePathname: () => currentPath }));

function currentTabs() {
  const bar = screen.getByRole("navigation");
  return within(bar)
    .getAllByRole("link")
    .filter((link) => link.getAttribute("aria-current") === "page")
    .map((link) => link.textContent);
}

beforeEach(() => {
  currentPath = "/";
});

describe("patient TabBar", () => {
  it("links the five browse pages", () => {
    renderIn("en", <TabBar />);

    const links = within(screen.getByRole("navigation")).getAllByRole("link");
    expect(
      links.map((link) => [link.textContent, link.getAttribute("href")]),
    ).toEqual([
      ["Home", "/"],
      ["Remedies", "/remedies"],
      ["My care", "/care"],
      ["Orders", "/orders"],
      ["Profile", "/profile"],
    ]);
  });

  it.each([
    ["/", "Home"],
    ["/remedies", "Remedies"],
    ["/care", "My care"],
    ["/orders", "Orders"],
    ["/profile", "Profile"],
  ])("highlights only the current page (%s)", (path, label) => {
    currentPath = path;
    renderIn("en", <TabBar />);

    expect(currentTabs()).toEqual([label]);
  });

  it("keeps a section highlighted on its sub-pages, but not on look-alike paths", () => {
    currentPath = "/care/consultations/42";
    const { unmount } = renderIn("en", <TabBar />);
    expect(currentTabs()).toEqual(["My care"]);
    unmount();

    currentPath = "/care-guide";
    renderIn("en", <TabBar />);
    expect(currentTabs()).toEqual([]);
  });

  it("is highlighted nowhere on a task page such as the cart", () => {
    currentPath = "/cart";
    renderIn("en", <TabBar />);

    expect(currentTabs()).toEqual([]);
  });

  it("labels the tabs in Bangla", () => {
    currentPath = "/care";
    renderIn("bn", <TabBar />);

    const labels = within(screen.getByRole("navigation"))
      .getAllByRole("link")
      .map((link) => link.textContent);
    expect(labels).toEqual(["হোম", "ওষুধ", "চিকিৎসা", "অর্ডার", "প্রোফাইল"]);
    expect(currentTabs()).toEqual(["চিকিৎসা"]);
  });
});
