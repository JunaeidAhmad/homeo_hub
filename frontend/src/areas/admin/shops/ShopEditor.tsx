"use client";

import { useEffect, useId, useState, type FormEvent } from "react";

import type { components } from "@/api/schema";
import { LocationPicker } from "@/components/LocationPicker";
import { FormAlert, TextAreaField, TextField } from "@/components/form/fields";
import { fill } from "@/i18n/catalog";
import type { AdminMessages } from "@/i18n/messages/admin";
import { useMessages } from "@/i18n/provider";

import { useStaffSession } from "../session";
import { useAdminSubmit } from "../use-admin-submit";

export type Shop = components["schemas"]["AdminShop"];
type Location = components["schemas"]["Location"];
type ShopStaff = components["schemas"]["AdminShopStaff"];
type Candidate = components["schemas"]["AdminShopStaffCandidate"];
type StaffRole = components["schemas"]["ShopStaffRoleEnum"];

export function ShopEditor({
  shop,
  onSaved,
  onClose,
}: {
  shop?: Shop;
  onSaved: (saved: Shop) => void;
  onClose: () => void;
}) {
  const { t } = useMessages<AdminMessages>();
  const { api } = useStaffSession();
  const { pending, problems, setProblems, submit } = useAdminSubmit();

  const [name, setName] = useState(shop?.name ?? "");
  const [slug, setSlug] = useState(shop?.slug ?? "");
  const [area, setArea] = useState<Location | null>(shop?.location ?? null);
  const [addressLine, setAddressLine] = useState(shop?.address_line ?? "");
  const [phone, setPhone] = useState(shop?.phone ? shop.phone.replace(/^\+880/, "") : "");
  const [isVerified, setIsVerified] = useState(shop?.is_verified ?? false);
  const [isActive, setIsActive] = useState(shop?.is_active ?? true);

  function save(event: FormEvent) {
    event.preventDefault();
    const missing: Record<string, string> = {};
    const required = t("admin.error.required");
    if (!name.trim()) missing.name = required;
    if (!area) missing.location_id = required;
    if (!addressLine.trim()) missing.address_line = required;
    if (!phone.trim()) missing.phone = required;
    if (Object.keys(missing).length > 0 || !area) {
      setProblems({ fields: missing, form: required });
      return;
    }

    const body = {
      name: name.trim(),
      slug: slug.trim(),
      location_id: area.id,
      address_line: addressLine.trim(),
      phone: phone.trim(),
      is_verified: isVerified,
      is_active: isActive,
    };

    void submit(
      () =>
        shop
          ? api.PATCH("/api/v1/admin/shops/{id}/", { params: { path: { id: shop.id } }, body })
          : api.POST("/api/v1/admin/shops/", { body }),
      onSaved,
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <button
        type="button"
        onClick={onClose}
        className="min-h-11 self-start font-semibold text-primary underline"
      >
        {t("admin.shop.close")}
      </button>
      <h2 className="font-display text-2xl">
        {shop ? fill(t("admin.staff.editTitle"), { name: shop.name }) : t("admin.shop.add")}
      </h2>

      <form
        onSubmit={save}
        noValidate
        className="flex flex-col gap-5 rounded-panel border border-line bg-surface p-4 desktop:p-6"
      >
        {problems.form && <FormAlert>{problems.form}</FormAlert>}
        <div className="grid gap-5 desktop:grid-cols-2">
          <TextField
            label={t("admin.shop.name")}
            value={name}
            error={problems.fields.name}
            onChange={(event) => setName(event.target.value)}
            maxLength={150}
          />
          <TextField
            label={t("admin.remedy.slug")}
            hint={t("admin.shop.slugHint")}
            value={slug}
            error={problems.fields.slug}
            onChange={(event) => setSlug(event.target.value)}
            maxLength={160}
            autoCapitalize="none"
            spellCheck={false}
          />
          <TextField
            label={t("admin.shop.phone")}
            prefix="+880"
            type="tel"
            value={phone}
            error={problems.fields.phone}
            onChange={(event) => setPhone(event.target.value)}
          />
          <LocationPicker
            client={api}
            value={area}
            onChange={setArea}
            error={problems.fields.location_id}
          />
        </div>

        <TextAreaField
          label={t("admin.shop.address")}
          value={addressLine}
          error={problems.fields.address_line}
          onChange={(event) => setAddressLine(event.target.value)}
          maxLength={300}
        />

        <div className="flex flex-wrap gap-6">
          <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-[15px] font-semibold">
            <input
              type="checkbox"
              checked={isVerified}
              onChange={(event) => setIsVerified(event.target.checked)}
              className="size-5 accent-primary"
            />
            <span>{t("admin.shop.verified")}</span>
          </label>
          <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-[15px] font-semibold">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(event) => setIsActive(event.target.checked)}
              className="size-5 accent-primary"
            />
            <span>{t("admin.staff.active")}</span>
          </label>
        </div>

        <button
          type="submit"
          disabled={pending}
          className="min-h-13 rounded-control bg-primary px-6 font-bold text-surface disabled:opacity-60 desktop:self-start"
        >
          {t(shop ? "admin.staff.save" : "admin.shop.create")}
        </button>
      </form>

      {shop && <ShopStaffPanel key={shop.id} shopId={shop.id} />}
    </div>
  );
}

function ShopStaffPanel({ shopId }: { shopId: string }) {
  const { t } = useMessages<AdminMessages>();
  const { api } = useStaffSession();
  const { pending, problems, submit } = useAdminSubmit();
  const searchId = useId();
  const roleId = useId();

  const [links, setLinks] = useState<ShopStaff[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [query, setQuery] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [role, setRole] = useState<StaffRole>("OWNER");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    api
      .GET("/api/v1/admin/shops/{id}/staff/", {
        params: { path: { id: shopId } },
        signal: controller.signal,
      })
      .then(({ data }) => {
        if (data) setLinks(data);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [api, shopId, reloadKey]);

  useEffect(() => {
    const controller = new AbortController();
    api
      .GET("/api/v1/admin/shop-staff-candidates/", {
        params: { query: { q: query.trim() || undefined } },
        signal: controller.signal,
      })
      .then(({ data }) => {
        if (data) setCandidates(data);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [api, query]);

  const linkedIds = new Set(links.map((l) => l.user_id));
  const availableCandidates = candidates.filter((c) => !linkedIds.has(c.id));

  function linkUser(event: FormEvent) {
    event.preventDefault();
    const chosen = availableCandidates.find((c) => String(c.id) === selectedUserId) ?? availableCandidates[0];
    if (!chosen) return;
    void submit(
      () =>
        api.POST("/api/v1/admin/shops/{id}/staff/", {
          params: { path: { id: shopId } },
          body: { user_id: chosen.id, role },
        }),
      () => {
        setSelectedUserId("");
        setReloadKey((n) => n + 1);
      },
    );
  }

  function unlinkUser(linkId: string) {
    void submit(
      () =>
        api.DELETE("/api/v1/admin/shops/{id}/staff/{link_id}/", {
          params: { path: { id: shopId, link_id: linkId } },
        }),
      () => setReloadKey((n) => n + 1),
    );
  }

  return (
    <section className="flex flex-col gap-4 rounded-panel border border-line bg-surface p-4 desktop:p-6">
      <h3 className="font-display text-xl">{t("admin.shop.staff")}</h3>
      {problems.form && <FormAlert>{problems.form}</FormAlert>}

      {links.length === 0 ? (
        <p className="text-ink-muted">{t("admin.shop.noStaff")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {links.map((link) => (
            <li
              key={link.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-line px-3.5 py-2.5"
            >
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="font-semibold">{link.full_name}</span>
                <span className="text-sm text-ink-muted">{link.phone}</span>
                <span className="rounded-control bg-mist px-2 py-0.5 text-xs font-semibold">
                  {t(`admin.shop.staffRole.${link.role}`)}
                </span>
              </div>
              <button
                type="button"
                disabled={pending}
                onClick={() => unlinkUser(link.id)}
                className="min-h-11 rounded-control border border-line-strong bg-surface px-3.5 text-sm font-semibold text-danger"
              >
                {t("admin.illness.removeRemedy")}
              </button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={linkUser} className="flex flex-col gap-3 border-t border-line pt-4">
        <p className="text-[15px] font-semibold">{t("admin.shop.linkUser")}</p>
        <div className="grid gap-3 desktop:grid-cols-3">
          <div className="flex flex-col gap-1">
            <label htmlFor={searchId} className="text-sm font-medium text-ink-soft">
              {t("admin.shop.searchCandidates")}
            </label>
            <input
              id={searchId}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="min-h-11 rounded-control border border-line-strong bg-surface px-3 text-base"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor={`${searchId}-select`} className="text-sm font-medium text-ink-soft">
              {t("admin.staff.name")}
            </label>
            <select
              id={`${searchId}-select`}
              value={selectedUserId || String(availableCandidates[0]?.id ?? "")}
              onChange={(event) => setSelectedUserId(event.target.value)}
              className="min-h-11 rounded-control border border-line-strong bg-surface px-3 text-base"
            >
              {availableCandidates.length === 0 ? (
                <option value="">{t("admin.shop.noCandidates")}</option>
              ) : (
                availableCandidates.map((c) => (
                  <option key={c.id} value={String(c.id)}>
                    {c.full_name} ({c.phone})
                  </option>
                ))
              )}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor={roleId} className="text-sm font-medium text-ink-soft">
              {t("admin.staff.roles")}
            </label>
            <select
              id={roleId}
              value={role}
              onChange={(event) => setRole(event.target.value as StaffRole)}
              className="min-h-11 rounded-control border border-line-strong bg-surface px-3 text-base"
            >
              <option value="OWNER">{t("admin.shop.staffRole.OWNER")}</option>
              <option value="STAFF">{t("admin.shop.staffRole.STAFF")}</option>
            </select>
          </div>
        </div>
        <button
          type="submit"
          disabled={pending || availableCandidates.length === 0}
          className="min-h-11 self-start rounded-control bg-primary px-5 font-bold text-surface disabled:opacity-50"
        >
          {t("admin.shop.linkAction")}
        </button>
      </form>
    </section>
  );
}
