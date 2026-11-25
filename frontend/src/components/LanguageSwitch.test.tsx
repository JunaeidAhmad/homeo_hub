import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LanguageSwitch } from "@/components/LanguageSwitch";
import { renderIn } from "@/test/render";

beforeEach(() => {
  document.cookie = "hh_lang=; Max-Age=0; path=/";
});

describe("LanguageSwitch", () => {
  it("shows which language is on", () => {
    renderIn("bn", <LanguageSwitch reload={() => {}} />);

    expect(screen.getByRole("group", { name: "ভাষা" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "বাংলা" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "English" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("remembers the new language and reloads the page in it", async () => {
    const reload = vi.fn();
    renderIn("en", <LanguageSwitch reload={reload} />);

    await userEvent.click(screen.getByRole("button", { name: "বাংলা" }));

    expect(document.cookie).toContain("hh_lang=bn");
    expect(reload).toHaveBeenCalledOnce();
  });

  it("does nothing when the current language is chosen again", async () => {
    const reload = vi.fn();
    renderIn("en", <LanguageSwitch reload={reload} />);

    await userEvent.click(screen.getByRole("button", { name: "English" }));

    expect(document.cookie).not.toContain("hh_lang");
    expect(reload).not.toHaveBeenCalled();
  });
});
