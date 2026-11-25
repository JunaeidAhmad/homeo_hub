import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { LocationsTable } from "@/areas/admin/LocationsTable";
import { area, fakeApi, page } from "@/test/fake-api";
import { renderIn } from "@/test/render";

// 45 areas: Area 01 … Area 45
const all = Array.from({ length: 45 }, (_, i) => {
  const n = String(i + 1).padStart(2, "0");
  return area(`Area ${n}`, `District ${n}`, "Dhaka", n);
});

function server(url: URL) {
  const q = (url.searchParams.get("q") ?? "").toLowerCase();
  const size = Number(url.searchParams.get("page_size") ?? 20);
  const current = Number(url.searchParams.get("page") ?? 1);
  const matches = all.filter((a) => a.display_name.toLowerCase().includes(q));
  return { body: { ...page(matches.slice((current - 1) * size, current * size)), count: matches.length } };
}

const upazilaCells = () =>
  screen
    .getAllByRole("row")
    .slice(1)
    .map((row) => within(row).getAllByRole("cell")[2].textContent);

describe("admin LocationsTable", () => {
  it("lists the first page of areas with their division, district and upazila", async () => {
    const { client } = fakeApi(server);
    renderIn("en", <LocationsTable client={client} />);

    await screen.findByRole("table");

    expect(screen.getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["Division", "District", "Upazila"]);
    expect(upazilaCells()).toHaveLength(20);
    expect(upazilaCells()[0]).toBe("Area 01");
    expect(screen.getByText("Page 1 of 3")).toBeInTheDocument();
  });

  it("moves to the next page", async () => {
    const { client, requests } = fakeApi(server);
    renderIn("en", <LocationsTable client={client} />);
    await screen.findByRole("table");

    await userEvent.click(screen.getByRole("button", { name: "Next" }));

    await waitFor(() => expect(upazilaCells()[0]).toBe("Area 21"));
    expect(requests.at(-1)!.url.searchParams.get("page")).toBe("2");
    expect(screen.getByText("Page 2 of 3")).toBeInTheDocument();
  });

  it("searches after a pause in typing, and jumps back to page 1 with one request", async () => {
    const { client, requests } = fakeApi(server);
    renderIn("en", <LocationsTable client={client} />);
    await screen.findByRole("table");
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(upazilaCells()[0]).toBe("Area 21"));
    requests.length = 0;

    await userEvent.type(screen.getByRole("searchbox"), "area 3");

    await waitFor(() => expect(upazilaCells()).toEqual(["Area 30", "Area 31", "Area 32", "Area 33", "Area 34", "Area 35", "Area 36", "Area 37", "Area 38", "Area 39"]));
    expect(requests.map((r) => [r.url.searchParams.get("q"), r.url.searchParams.get("page")])).toEqual([["area 3", "1"]]);
  });

  it("shows the language it asked the API for", async () => {
    const { client, requests } = fakeApi(server, "bn");
    renderIn("bn", <LocationsTable client={client} />);

    await screen.findByRole("table");

    expect(requests[0].language).toBe("bn");
    expect(screen.getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["বিভাগ", "জেলা", "উপজেলা"]);
  });

  it("reports a failed load and loads again on request", async () => {
    let failing = true;
    const { client } = fakeApi((url) =>
      failing ? { status: 500, body: { detail: "boom" } } : server(url),
    );
    renderIn("en", <LocationsTable client={client} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't load the list.");

    failing = false;
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByRole("table")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
