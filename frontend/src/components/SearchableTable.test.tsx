import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { SearchableTable, type Column } from "@/components/SearchableTable";
import { renderIn } from "@/test/render";

type Row = { id: string; name: string; district: string };

const columns: Column<Row>[] = [
  { key: "name", header: "Name", cell: (row) => row.name },
  { key: "district", header: "District", cell: (row) => row.district },
];
const rows: Row[] = [
  { id: "1", name: "Savar", district: "Dhaka" },
  { id: "2", name: "Kapasia", district: "Gazipur" },
];

function setup(props: Partial<React.ComponentProps<typeof SearchableTable<Row>>> = {}, locale: "en" | "bn" = "en") {
  const handlers = { onQueryChange: vi.fn(), onPageChange: vi.fn(), onRetry: vi.fn() };
  renderIn(
    locale,
    <SearchableTable<Row>
      columns={columns}
      rows={rows}
      getRowId={(row) => row.id}
      query=""
      page={1}
      pageSize={20}
      total={2}
      status="ready"
      {...handlers}
      {...props}
    />,
  );
  return handlers;
}

describe("SearchableTable", () => {
  it("shows a column per header and a row per item", () => {
    setup();

    const table = screen.getByRole("table");
    expect(within(table).getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["Name", "District"]);
    const bodyRows = within(table).getAllByRole("row").slice(1);
    expect(bodyRows.map((row) => within(row).getAllByRole("cell").map((c) => c.textContent))).toEqual([
      ["Savar", "Dhaka"],
      ["Kapasia", "Gazipur"],
    ]);
  });

  it("reports what is typed in the search box", async () => {
    const { onQueryChange } = setup();

    await userEvent.type(screen.getByRole("searchbox", { name: "Search" }), "s");

    expect(onQueryChange).toHaveBeenCalledWith("s");
  });

  it("pages forward and back, and stops at both ends", async () => {
    const { onPageChange } = setup({ total: 50, page: 2 });
    expect(screen.getByText("Page 2 of 3")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    await userEvent.click(screen.getByRole("button", { name: "Previous" }));

    expect(onPageChange.mock.calls).toEqual([[3], [1]]);
  });

  it("marks Previous unavailable on the first page, without losing keyboard focus", async () => {
    const { onPageChange } = setup({ total: 50, page: 1 });
    const previous = screen.getByRole("button", { name: "Previous" });
    expect(previous).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("button", { name: "Next" })).toHaveAttribute("aria-disabled", "false");

    await userEvent.click(previous);

    expect(onPageChange).not.toHaveBeenCalled();
    expect(previous).toHaveFocus(); // a natively disabled button would drop focus
  });

  it("marks Next unavailable on the last page", async () => {
    const { onPageChange } = setup({ total: 50, page: 3 });

    await userEvent.click(screen.getByRole("button", { name: "Next" }));

    expect(onPageChange).not.toHaveBeenCalled();
  });

  it("says so when nothing matches", () => {
    setup({ rows: [], total: 0 });
    expect(screen.getByText("Nothing matches your search.")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("says so while loading and when loading fails", () => {
    setup({ status: "loading", rows: [] });
    expect(screen.getByText("Loading…")).toBeInTheDocument();
  });

  it("shows an error it can be retried from", async () => {
    const { onRetry } = setup({ status: "error", rows: [] });
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't load the list.");

    await userEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("shows Bangla labels and Bangla digits", () => {
    setup({ total: 50, page: 2 }, "bn");

    expect(screen.getByText("পৃষ্ঠা ২ / ৩")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "পরের" })).toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: "খুঁজুন" })).toBeInTheDocument();
  });
});
