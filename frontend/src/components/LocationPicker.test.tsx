import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { LocationPicker } from "@/components/LocationPicker";
import { area, fakeApi, page, type Location } from "@/test/fake-api";
import { renderIn } from "@/test/render";

const savar = area("Savar", "Dhaka", "Dhaka");
const dhamrai = area("Dhamrai", "Dhaka", "Dhaka");
const kapasia = area("Kapasia", "Gazipur", "Dhaka");
const mirpur = area("Mirpur", "Dhaka", "Dhaka", "mirpur", "CITY_THANA");
const AREAS = [savar, dhamrai, mirpur, kapasia, area("Birganj", "Dinajpur", "Rangpur")];

function respond(url: URL) {
  const division = url.searchParams.get("division");
  const district = url.searchParams.get("district");
  const names = (key: "division" | "district", rows: Location[]) =>
    [...new Set(rows.map((row) => row[key]))].map((name) => ({ name }));
  if (url.pathname === "/api/v1/locations/divisions/") return { body: names("division", AREAS) };
  if (url.pathname === "/api/v1/locations/districts/") {
    return { body: names("district", AREAS.filter((a) => a.division === division)) };
  }
  return { body: page(AREAS.filter((a) => a.district === district)) };
}

function setup(props: { value?: Location | null; language?: "en" | "bn" } = {}) {
  const api = fakeApi(respond, props.language);
  const onChange = vi.fn();
  renderIn(
    props.language ?? "en",
    <LocationPicker client={api.client} value={props.value ?? null} onChange={onChange} />,
  );
  const select = (name: string) => screen.getByRole("combobox", { name });
  return { ...api, onChange, select };
}

const ready = (element: HTMLElement) => waitFor(() => expect(element).toBeEnabled());

describe("LocationPicker", () => {
  it("lists divisions first; district and upazila wait for the level above", async () => {
    const { select } = setup();

    await ready(select("Division"));
    expect(screen.getByRole("option", { name: "Rangpur" })).toBeInTheDocument();
    expect(select("District")).toBeDisabled();
    expect(select("Upazila / thana")).toBeDisabled();
  });

  it("fetches a division's districts, then a district's upazilas, and reports the area", async () => {
    const { select, onChange, requests } = setup();

    await ready(select("Division"));
    await userEvent.selectOptions(select("Division"), "Dhaka");
    await ready(select("District"));
    expect(requests.at(-1)!.url.searchParams.get("division")).toBe("Dhaka");
    expect(screen.queryByRole("option", { name: "Dinajpur" })).not.toBeInTheDocument();

    await userEvent.selectOptions(select("District"), "Dhaka");
    await ready(select("Upazila / thana"));
    expect(requests.at(-1)!.url.searchParams.get("district")).toBe("Dhaka");
    expect(screen.queryByRole("option", { name: "Kapasia" })).not.toBeInTheDocument();

    await userEvent.selectOptions(select("Upazila / thana"), "Savar");
    expect(onChange).toHaveBeenLastCalledWith(savar);
  });

  it("lists a city's police thanas apart from its upazilas", async () => {
    const { select } = setup({ value: savar });
    await ready(select("Upazila / thana"));

    const groups = within(select("Upazila / thana")).getAllByRole("group");
    expect(groups.map((group) => group.getAttribute("label"))).toEqual([
      "Dhaka city thanas",
      "Upazilas",
    ]);
    expect(within(groups[0]).getAllByRole("option").map((o) => o.textContent)).toEqual(["Mirpur"]);
    expect(within(groups[1]).getAllByRole("option").map((o) => o.textContent)).toEqual([
      "Dhamrai",
      "Savar",
    ]);
  });

  it("forgets the chosen area when a level above it changes", async () => {
    function Harness() {
      const [value, setValue] = useState<Location | null>(savar);
      return (
        <>
          <LocationPicker client={fakeApi(respond).client} value={value} onChange={setValue} />
          <output>{value?.upazila ?? "none"}</output>
        </>
      );
    }
    renderIn("en", <Harness />);
    const district = screen.getByRole("combobox", { name: "District" });

    await ready(district);
    await userEvent.selectOptions(district, "Gazipur");

    expect(screen.getByRole("status")).toHaveTextContent("none");
    await ready(screen.getByRole("combobox", { name: "Upazila / thana" }));
    expect(screen.getByRole("option", { name: "Kapasia" })).toBeInTheDocument();
  });

  it("shows an area given from outside at every level", async () => {
    const { select } = setup({ value: kapasia });

    expect(select("Division")).toHaveValue("Dhaka");
    expect(select("District")).toHaveValue("Gazipur");
    expect(select("Upazila / thana")).toHaveValue(kapasia.id);
  });

  it("asks in the page's language and labels the levels in Bangla", async () => {
    const { requests } = setup({ language: "bn" });

    await ready(screen.getByRole("combobox", { name: "বিভাগ" }));
    expect(requests[0].language).toBe("bn");
  });

  it("says when the areas could not be loaded and tries again", async () => {
    let fail = true;
    const api = fakeApi((url) => (fail ? { status: 500, body: {} } : respond(url)));
    renderIn("en", <LocationPicker client={api.client} value={null} onChange={vi.fn()} />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't load areas.");
    fail = false;
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));

    await ready(screen.getByRole("combobox", { name: "Division" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
