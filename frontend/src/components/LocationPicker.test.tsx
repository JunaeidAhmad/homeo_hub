import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { LocationPicker } from "@/components/LocationPicker";
import { area, fakeApi, page, type Location } from "@/test/fake-api";
import { renderIn } from "@/test/render";

const savar = area("Savar", "Dhaka", "Dhaka");
const kapasia = area("Kapasia", "Gazipur", "Dhaka");

const areasMatching = (url: URL) => {
  const q = (url.searchParams.get("q") ?? "").toLowerCase();
  return page([savar, kapasia].filter((a) => a.display_name.toLowerCase().includes(q)));
};

function setup(props: { value?: Location | null; language?: "en" | "bn" } = {}) {
  const api = fakeApi((url) => ({ body: areasMatching(url) }), props.language);
  const onChange = vi.fn();
  renderIn(
    props.language ?? "en",
    <LocationPicker client={api.client} value={props.value ?? null} onChange={onChange} />,
  );
  return { ...api, onChange, input: screen.getByRole("combobox", { name: /area|এলাকা/i }) };
}

describe("LocationPicker", () => {
  it("shows a hint and asks the API nothing until you type", () => {
    const { requests } = setup();

    expect(screen.getByText("Type your upazila, district or division")).toBeInTheDocument();
    expect(requests).toHaveLength(0);
  });

  it("offers matching areas as you type, asking the API in the page's language", async () => {
    const { input, requests } = setup();

    await userEvent.type(input, "sav");

    expect(await screen.findByRole("option", { name: "Savar, Dhaka, Dhaka" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /Kapasia/ })).not.toBeInTheDocument();
    const last = requests.at(-1)!;
    expect(last.url.pathname).toBe("/api/v1/locations/");
    expect(last.url.searchParams.get("q")).toBe("sav");
    expect(last.url.searchParams.get("page_size")).toBe("8");
    expect(last.language).toBe("en");
  });

  it("waits for a pause in typing before searching", async () => {
    const { input, requests } = setup();

    await userEvent.type(input, "kapasia");
    await screen.findByRole("option", { name: /Kapasia/ });

    expect(requests.map((r) => r.url.searchParams.get("q"))).toEqual(["kapasia"]);
  });

  it("chooses an area by click and shows it in the field", async () => {
    const { input, onChange } = setup();
    await userEvent.type(input, "kap");

    await userEvent.click(await screen.findByRole("option", { name: /Kapasia/ }));

    expect(onChange).toHaveBeenCalledWith(kapasia);
    expect(input).toHaveValue("Kapasia, Gazipur, Dhaka");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("can be driven from the keyboard", async () => {
    const { input, onChange } = setup();
    await userEvent.type(input, "a"); // matches both areas
    await screen.findAllByRole("option");

    await userEvent.keyboard("{ArrowDown}{ArrowDown}{Enter}");

    expect(onChange).toHaveBeenCalledWith(kapasia);
  });

  it("closes the list with Escape without choosing", async () => {
    const { input, onChange } = setup();
    await userEvent.type(input, "sav");
    await screen.findByRole("listbox");

    await userEvent.keyboard("{Escape}");

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("says so when nothing matches", async () => {
    const { input } = setup();

    await userEvent.type(input, "zzz");

    expect(await screen.findByText("No area found. Check the spelling.")).toBeInTheDocument();
  });

  it("says so when the areas cannot be loaded", async () => {
    const api = fakeApi(() => ({ status: 500, body: { detail: "boom" } }));
    renderIn("en", <LocationPicker client={api.client} value={null} onChange={() => {}} />);

    await userEvent.type(screen.getByRole("combobox"), "sav");

    expect(await screen.findByText("Couldn't load areas. Try again.")).toBeInTheDocument();
  });

  it("forgets the chosen area as soon as you edit the text", async () => {
    const { input, onChange } = setup({ value: savar });
    expect(input).toHaveValue("Savar, Dhaka, Dhaka");

    await userEvent.type(input, "x");

    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("clears the field with the clear button", async () => {
    const { input, onChange } = setup({ value: savar });

    await userEvent.click(screen.getByRole("button", { name: "Clear" }));

    expect(onChange).toHaveBeenCalledWith(null);
    expect(input).toHaveValue("");
  });

  it("works in Bangla: labels, hint and the language sent to the API", async () => {
    const { input, requests } = setup({ language: "bn" });

    expect(screen.getByText("আপনার উপজেলা, জেলা বা বিভাগের নাম লিখুন")).toBeInTheDocument();
    await userEvent.type(input, "sav");
    await waitFor(() => expect(requests.length).toBeGreaterThan(0));

    expect(requests.at(-1)!.language).toBe("bn");
  });

  it("is not 'expanded' while the popup only shows a message", async () => {
    const { input } = setup();

    await userEvent.type(input, "zzz");
    await screen.findByText("No area found. Check the spelling.");

    expect(input).toHaveAttribute("aria-expanded", "false");
    expect(input).not.toHaveAttribute("aria-controls");
  });

  it("points at the highlighted option only while the list is open", async () => {
    const { input } = setup();
    await userEvent.type(input, "a");
    await screen.findAllByRole("option");

    await userEvent.keyboard("{ArrowDown}");
    expect(input).toHaveAttribute("aria-activedescendant", screen.getAllByRole("option")[0].id);

    await userEvent.keyboard("{Escape}");
    expect(input).not.toHaveAttribute("aria-activedescendant");
  });

  it("never selects an area left over from an earlier search while you keep typing", async () => {
    const { input, onChange } = setup();
    await userEvent.type(input, "sav");
    await screen.findByRole("option", { name: /Savar/ });

    // More typing, then a quick Down + Enter before the new search has come back.
    await userEvent.type(input, "x{ArrowDown}{Enter}");

    expect(onChange).not.toHaveBeenCalledWith(savar);
  });

  it("shows an area that is chosen from outside after the first render", async () => {
    function Harness() {
      const [value, setValue] = useState<Location | null>(null);
      return (
        <>
          <button onClick={() => setValue(kapasia)}>load profile</button>
          <LocationPicker client={fakeApi(() => ({ body: page([]) })).client} value={value} onChange={setValue} />
        </>
      );
    }
    renderIn("en", <Harness />);

    await userEvent.click(screen.getByRole("button", { name: "load profile" }));

    expect(screen.getByRole("combobox")).toHaveValue("Kapasia, Gazipur, Dhaka");
  });
});
