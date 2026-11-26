"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useState, type FormEvent } from "react";

import type { components } from "@/api/schema";
import { RemedySearch, type RemedyOption } from "@/components/RemedySearch";
import { SearchableTable, type Column } from "@/components/SearchableTable";
import { FormAlert, TextField } from "@/components/form/fields";
import { useListQuery, type ListParams } from "@/hooks/use-list-query";
import { fill } from "@/i18n/catalog";
import { formatMoney, numberFormat, parseTakaToPoisha, poishaToTakaInput } from "@/i18n/format";
import type { AdminMessages } from "@/i18n/messages/admin";
import { useMessages } from "@/i18n/provider";

import { useStaffSession } from "../session";
import { useAdminSubmit } from "../use-admin-submit";
import type { Shop } from "./ShopEditor";

type Listing = components["schemas"]["AdminShopRemedy"];
type Unit = components["schemas"]["ShopUnitEnum"];
const UNITS: Unit[] = ["ML", "GRAM", "DRAM", "PIECE"];

export function ShopPriceList({ shopId }: { shopId: string }) {
  const { locale, t } = useMessages<AdminMessages>();
  const session = useStaffSession();
  const { api } = session;

  const [shop, setShop] = useState<Shop | null>(null);
  const [shopStatus, setShopStatus] = useState<"loading" | "ready" | "error">("loading");
  const [editing, setEditing] = useState<{ listing?: Listing } | null>(null);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    api
      .GET("/api/v1/admin/shops/{id}/", {
        params: { path: { id: shopId } },
        signal: controller.signal,
      })
      .then(({ data }) => {
        if (data) {
          setShop(data);
          setShopStatus("ready");
        } else {
          setShopStatus("error");
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setShopStatus("error");
      });
    return () => controller.abort();
  }, [api, shopId]);

  const fetchPage = useCallback(
    async ({ q, page, pageSize }: ListParams, signal: AbortSignal) => {
      const { data } = await api.GET("/api/v1/admin/shops/{id}/remedies/", {
        params: { path: { id: shopId }, query: { q: q || undefined, page, page_size: pageSize } },
        signal,
      });
      return data ?? null;
    },
    [api, shopId],
  );
  const list = useListQuery<Listing>(fetchPage);

  const canGoBack =
    session.status === "signedIn" &&
    (session.staff.permissions.includes("manage_shops") || session.staff.shops.length > 1);

  if (shopStatus === "loading") {
    return (
      <p role="status" className="text-ink-muted">
        {t("admin.loading")}
      </p>
    );
  }

  if (shopStatus === "error" || !shop) {
    return <FormAlert>{t("admin.unavailable")}</FormAlert>;
  }

  const columns: Column<Listing>[] = [
    {
      key: "remedy",
      header: t("admin.shop.remedy"),
      cell: (row) => (
        <span lang="la" className="font-display text-lg italic">
          {row.remedy.name}
        </span>
      ),
    },
    {
      key: "pack",
      header: t("admin.shop.pack"),
      cell: (row) =>
        `${numberFormat(locale).format(row.pack_size)} ${t(`admin.shop.unit.${row.unit}`)}`,
    },
    {
      key: "price",
      header: t("admin.shop.price"),
      cell: (row) => <span className="font-display">{formatMoney(locale, row.price_poisha)}</span>,
    },
    {
      key: "stock",
      header: t("admin.shop.stock"),
      cell: (row) => numberFormat(locale).format(row.stock_qty),
    },
    {
      key: "reserved",
      header: t("admin.shop.reserved"),
      cell: (row) => numberFormat(locale).format(row.reserved_qty),
    },
    {
      key: "free",
      header: t("admin.shop.free"),
      cell: (row) => (
        <span className={row.free_qty <= 5 ? "font-semibold text-amber" : ""}>
          {numberFormat(locale).format(row.free_qty)}
        </span>
      ),
    },
    {
      key: "available",
      header: t("admin.shop.available"),
      cell: (row) =>
        row.is_available ? (
          <span className="text-primary">{t("admin.shop.availableYes")}</span>
        ) : (
          <span className="text-ink-muted">{t("admin.shop.availableNo")}</span>
        ),
    },
    {
      key: "actions",
      header: t("admin.staff.actions"),
      cell: (row) => (
        <button
          type="button"
          onClick={() => {
            setNotice("");
            setEditing({ listing: row });
          }}
          className="min-h-11 rounded-control border border-line-strong bg-surface px-4 font-semibold"
        >
          {t("admin.staff.edit")}
        </button>
      ),
    },
  ];

  return (
    <section className="flex flex-col gap-5">
      {canGoBack && (
        <Link href="/admin/shops" className="min-h-11 self-start font-semibold text-primary underline">
          {t("admin.shop.backToList")}
        </Link>
      )}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="font-display text-[34px] leading-tight font-normal desktop:text-[44px]">
              {shop.name}
            </h1>
            <span
              className={`rounded-control px-2.5 py-0.5 text-sm font-semibold ${
                shop.is_verified ? "bg-mist text-primary" : "bg-amber-wash text-amber"
              }`}
            >
              {t(shop.is_verified ? "admin.shop.verifiedYes" : "admin.shop.verifiedNo")}
            </span>
          </div>
          <p className="text-base text-ink-soft">{shop.location.display_name}</p>
        </div>

        {!editing && (
          <button
            type="button"
            onClick={() => {
              setNotice("");
              setEditing({});
            }}
            className="min-h-13 rounded-control bg-primary px-5 font-bold text-surface"
          >
            {t("admin.shop.addListing")}
          </button>
        )}
      </div>

      <p role="status" className="rounded-control bg-mist px-3.5 py-3 font-medium empty:hidden">
        {notice}
      </p>

      {editing && (
        <ListingEditor
          key={editing.listing?.id ?? "new-listing"}
          shopId={shop.id}
          listing={editing.listing}
          onClose={() => setEditing(null)}
          onSaved={(saved) => {
            setNotice(fill(t("admin.shop.listingSaved"), { name: saved.remedy.name }));
            setEditing(null);
            list.retry();
          }}
          onDeleted={(name) => {
            setNotice(fill(t("admin.shop.listingRemoved"), { name }));
            setEditing(null);
            list.retry();
          }}
        />
      )}

      <SearchableTable
        columns={columns}
        rows={list.rows}
        getRowId={(row) => row.id}
        query={list.query}
        onQueryChange={list.setQuery}
        page={list.page}
        pageSize={list.pageSize}
        total={list.total}
        onPageChange={list.setPage}
        onRetry={list.retry}
        status={list.status}
      />
    </section>
  );
}

function ListingEditor({
  shopId,
  listing,
  onClose,
  onSaved,
  onDeleted,
}: {
  shopId: string;
  listing?: Listing;
  onClose: () => void;
  onSaved: (saved: Listing) => void;
  onDeleted: (remedyName: string) => void;
}) {
  const { t } = useMessages<AdminMessages>();
  const { api } = useStaffSession();
  const { pending, problems, setProblems, submit } = useAdminSubmit();
  const unitId = useId();

  const [pickedRemedy, setPickedRemedy] = useState<RemedyOption | null>(null);
  const [packSize, setPackSize] = useState(String(listing?.pack_size ?? 10));
  const [unit, setUnit] = useState<Unit>(listing?.unit ?? "ML");
  const [priceTaka, setPriceTaka] = useState(
    listing ? poishaToTakaInput(listing.price_poisha) : "",
  );
  const [stockQty, setStockQty] = useState(String(listing?.stock_qty ?? 0));
  const [isAvailable, setIsAvailable] = useState(listing?.is_available ?? true);

  function save(event: FormEvent) {
    event.preventDefault();
    const fields: Record<string, string> = {};
    const pack = Number(packSize);
    const stock = Number(stockQty);
    const pricePoisha = parseTakaToPoisha(priceTaka);

    if (!listing && !pickedRemedy) fields.remedy = t("admin.error.required");
    if (!Number.isInteger(pack) || pack <= 0) fields.pack_size = t("admin.error.required");
    if (pricePoisha === null) fields.price_poisha = t("admin.error.priceInvalid");
    if (!Number.isInteger(stock) || stock < 0) fields.stock_qty = t("admin.error.required");

    if (Object.keys(fields).length > 0 || pricePoisha === null) {
      setProblems({ fields, form: t("admin.error.required") });
      return;
    }

    if (listing) {
      void submit(
        () =>
          api.PATCH("/api/v1/admin/shop-remedies/{id}/", {
            params: { path: { id: listing.id } },
            body: {
              pack_size: pack,
              unit,
              price_poisha: pricePoisha,
              stock_qty: stock,
              is_available: isAvailable,
            },
          }),
        onSaved,
      );
    } else if (pickedRemedy) {
      void submit(
        () =>
          api.POST("/api/v1/admin/shops/{id}/remedies/", {
            params: { path: { id: shopId } },
            body: {
              remedy_id: pickedRemedy.id,
              pack_size: pack,
              unit,
              price_poisha: pricePoisha,
              stock_qty: stock,
              is_available: isAvailable,
            },
          }),
        onSaved,
      );
    }
  }

  function remove() {
    if (!listing) return;
    void submit(
      () =>
        api.DELETE("/api/v1/admin/shop-remedies/{id}/", {
          params: { path: { id: listing.id } },
        }),
      () => onDeleted(listing.remedy.name),
    );
  }

  return (
    <form
      onSubmit={save}
      noValidate
      className="flex flex-col gap-4 rounded-panel border border-line bg-surface p-4 desktop:p-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-2xl">
          {listing ? (
            <span lang="la" className="italic">
              {listing.remedy.name}
            </span>
          ) : (
            t("admin.shop.addListing")
          )}
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="min-h-11 font-semibold text-primary underline"
        >
          {t("admin.staff.cancel")}
        </button>
      </div>

      {problems.form && <FormAlert>{problems.form}</FormAlert>}

      {!listing && (
        <div className="flex flex-col gap-2">
          <RemedySearch
            label={t("admin.shop.remedy")}
            onPick={(remedy) => setPickedRemedy(remedy)}
          />
          {pickedRemedy && (
            <p className="text-sm font-semibold text-primary">
              <span lang="la" className="italic">
                {pickedRemedy.name}
              </span>
            </p>
          )}
          {problems.fields.remedy && (
            <p className="text-sm font-medium text-danger">{problems.fields.remedy}</p>
          )}
        </div>
      )}

      <div className="grid gap-4 desktop:grid-cols-4">
        <TextField
          label={t("admin.shop.packSize")}
          type="number"
          min={1}
          inputMode="numeric"
          value={packSize}
          error={problems.fields.pack_size}
          onChange={(event) => setPackSize(event.target.value)}
        />
        <div className="flex flex-col gap-1.5">
          <label htmlFor={unitId} className="text-[15px] font-semibold">
            {t("admin.shop.unit")}
          </label>
          <select
            id={unitId}
            value={unit}
            onChange={(event) => setUnit(event.target.value as Unit)}
            className="min-h-13 rounded-control border border-line-strong bg-surface px-3 text-[17px]"
          >
            {UNITS.map((u) => (
              <option key={u} value={u}>
                {t(`admin.shop.unit.${u}`)}
              </option>
            ))}
          </select>
        </div>
        <TextField
          label={t("admin.shop.price")}
          prefix="৳"
          inputMode="decimal"
          value={priceTaka}
          error={problems.fields.price_poisha}
          onChange={(event) => setPriceTaka(event.target.value)}
        />
        <TextField
          label={t("admin.shop.stock")}
          type="number"
          min={0}
          inputMode="numeric"
          value={stockQty}
          error={problems.fields.stock_qty}
          onChange={(event) => setStockQty(event.target.value)}
        />
      </div>

      <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-[15px] font-semibold">
        <input
          type="checkbox"
          checked={isAvailable}
          onChange={(event) => setIsAvailable(event.target.checked)}
          className="size-5 accent-primary"
        />
        <span>{t("admin.shop.availableYes")}</span>
      </label>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="submit"
          disabled={pending}
          className="min-h-13 rounded-control bg-primary px-6 font-bold text-surface disabled:opacity-60"
        >
          {t("admin.staff.save")}
        </button>
        {listing && (
          <button
            type="button"
            disabled={pending}
            onClick={remove}
            className="min-h-11 rounded-control border border-danger bg-surface px-4 font-semibold text-danger disabled:opacity-50"
          >
            {t("admin.shop.removeListing")}
          </button>
        )}
      </div>
    </form>
  );
}
