import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SideNavShell } from "@/components/shell/SideNavShell";
import { renderIn } from "@/test/render";

let currentPath = "/admin";
vi.mock("next/navigation", () => ({ usePathname: () => currentPath }));
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: ReactNode;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const items = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/doctors", label: "Doctors" },
];

const menuButton = () => screen.getByRole("button", { name: "Menu" });

function renderShell() {
  return renderIn(
    "en",
    <SideNavShell areaName="Admin" items={items}>
      <p>page</p>
    </SideNavShell>,
  );
}

beforeEach(() => {
  currentPath = "/admin";
});

describe("SideNavShell", () => {
  it("highlights only the most specific current item", () => {
    currentPath = "/admin/doctors";
    renderShell();

    const nav = screen.getByRole("navigation", { name: "Admin" });
    const current = within(nav)
      .getAllByRole("link")
      .filter((link) => link.getAttribute("aria-current") === "page");
    expect(current.map((link) => link.textContent)).toEqual(["Doctors"]);
  });

  it("opens and closes the menu from the Menu button", async () => {
    renderShell();
    expect(menuButton()).toHaveAttribute("aria-expanded", "false");

    await userEvent.click(menuButton());
    expect(menuButton()).toHaveAttribute("aria-expanded", "true");

    await userEvent.click(menuButton());
    expect(menuButton()).toHaveAttribute("aria-expanded", "false");
  });

  it("closes the menu when any item is chosen, even the page already open", async () => {
    renderShell();
    await userEvent.click(menuButton());

    await userEvent.click(screen.getByRole("link", { name: "Overview" }));

    expect(menuButton()).toHaveAttribute("aria-expanded", "false");
  });

  it("closes the menu with Escape", async () => {
    renderShell();
    await userEvent.click(menuButton());

    await userEvent.keyboard("{Escape}");

    expect(menuButton()).toHaveAttribute("aria-expanded", "false");
  });
});
