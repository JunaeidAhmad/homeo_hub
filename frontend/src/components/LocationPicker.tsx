"use client";

import { useEffect, useId, useState } from "react";

import type { ApiClient } from "@/api/client";
import type { components } from "@/api/schema";
import { useApiClient } from "@/api/use-api-client";
import { fill } from "@/i18n/catalog";
import type { CommonMessages } from "@/i18n/messages/common";
import { useMessages } from "@/i18n/provider";

type Location = components["schemas"]["Location"];

type Loaded<T> = { key: string; items: T[] | null }; // items: null = the request failed

/**
 * Load a list whenever `key` changes (empty key = nothing to load). Says whether what it
 * holds belongs to the current key, so a slow answer for an earlier choice never shows.
 */
function useList<T>(key: string, load: (signal: AbortSignal) => Promise<T[] | undefined>) {
  const [loaded, setLoaded] = useState<Loaded<T>>({ key: "", items: [] });

  useEffect(() => {
    if (!key) return;
    const controller = new AbortController();
    load(controller.signal)
      .then((items) => setLoaded({ key, items: items ?? null }))
      .catch(() => {
        if (!controller.signal.aborted) setLoaded({ key, items: null });
      });
    return () => controller.abort();
    // `load` is rebuilt every render; the key says when to load again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (!key) return { status: "idle" as const, items: [] as T[] };
  if (loaded.key !== key) return { status: "loading" as const, items: [] as T[] };
  if (!loaded.items) return { status: "error" as const, items: [] as T[] };
  return { status: "ready" as const, items: loaded.items };
}

const SELECT =
  "min-h-13 w-full rounded-control border bg-surface px-3 text-[17px] disabled:bg-mist disabled:text-ink-muted";

/**
 * Pick a Bangladesh area from the largest to the smallest: division, then one of its
 * districts, then one of that district's upazilas or, in a city, its police thanas. Each list is fetched once the
 * one above it is chosen. `value` is the chosen upazila; changing a level above it forgets
 * it (`onChange(null)`).
 */
export function LocationPicker({
  label,
  value,
  onChange,
  error,
  client,
}: {
  label?: string;
  value: Location | null;
  onChange: (area: Location | null) => void;
  /** A form's complaint about this field. */
  error?: string;
  /** Defaults to a client in the page's language; tests pass their own. */
  client?: ApiClient;
}) {
  const { t, locale } = useMessages<CommonMessages>();
  const defaultClient = useApiClient();
  const api = client ?? defaultClient;
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = error ? `${hintId} ${errorId}` : hintId;

  const [attempt, setAttempt] = useState(0); // bumped by "Try again" to load failed lists anew
  const [division, setDivision] = useState(value?.division ?? "");
  const [district, setDistrict] = useState(value?.district ?? "");

  // An area set from outside later (a profile that finished loading, a form emptied after
  // sending) shows up too. What this picker itself reported is already on screen.
  const [shownValue, setShownValue] = useState(value);
  const [reported, setReported] = useState<Location | null | undefined>(undefined);
  if (value !== shownValue) {
    setShownValue(value);
    if (value !== reported) {
      setDivision(value?.division ?? "");
      setDistrict(value?.district ?? "");
    }
  }

  function report(area: Location | null) {
    setReported(area);
    onChange(area);
  }

  const divisions = useList(`${attempt}`, async (signal) => {
    const { data } = await api.GET("/api/v1/locations/divisions/", { signal });
    return data?.map((row) => row.name);
  });
  const districts = useList(division && `${attempt}/${division}`, async (signal) => {
    const { data } = await api.GET("/api/v1/locations/districts/", {
      params: { query: { division } },
      signal,
    });
    return data?.map((row) => row.name);
  });
  const areas = useList(district && `${attempt}/${division}/${district}`, async (signal) => {
    const { data } = await api.GET("/api/v1/locations/", {
      params: { query: { division, district, page_size: 100 } },
      signal,
    });
    return data?.results;
  });

  const failed = [divisions, districts, areas].some((list) => list.status === "error");

  // A city district has its metropolitan police thanas as well as upazilas: list them apart,
  // each group in the page language's alphabetical order.
  const byName = (a: Location, b: Location) => a.upazila.localeCompare(b.upazila, locale);
  const cityThanas = areas.items.filter((area) => area.kind === "CITY_THANA").sort(byName);
  const upazilas = areas.items.filter((area) => area.kind !== "CITY_THANA").sort(byName);
  const options = (rows: Location[]) =>
    rows.map((area) => (
      <option key={area.id} value={area.id}>
        {area.upazila}
      </option>
    ));

  function chooseDivision(next: string) {
    setDivision(next);
    setDistrict("");
    if (value) report(null);
  }

  function chooseDistrict(next: string) {
    setDistrict(next);
    if (value) report(null);
  }

  function chooseArea(areaId: string) {
    report(areas.items.find((area) => area.id === areaId) ?? null);
  }

  /** The first, empty option: a prompt, or why there is nothing to choose yet. */
  function placeholder(status: string, prompt: string) {
    return status === "loading" ? t("location.loading") : prompt;
  }

  return (
    <fieldset className="flex min-w-0 flex-col gap-2">
      <legend className="mb-2 text-[15px] font-semibold">{label ?? t("location.label")}</legend>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-1.5">
          <label htmlFor={`${id}-division`} className="text-sm text-ink-soft">
            {t("location.division")}
          </label>
          <select
            id={`${id}-division`}
            value={division}
            onChange={(event) => chooseDivision(event.target.value)}
            disabled={divisions.status !== "ready"}
            aria-invalid={error && !division ? true : undefined}
            aria-describedby={describedBy}
            className={`${SELECT} ${error && !division ? "border-danger" : "border-line-strong"}`}
          >
            <option value="">{placeholder(divisions.status, t("location.chooseDivision"))}</option>
            {/* Keep a division given from outside visible while the list loads. */}
            {division && !divisions.items.includes(division) && <option value={division}>{division}</option>}
            {divisions.items.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex min-w-0 flex-col gap-1.5">
          <label htmlFor={`${id}-district`} className="text-sm text-ink-soft">
            {t("location.district")}
          </label>
          <select
            id={`${id}-district`}
            value={district}
            onChange={(event) => chooseDistrict(event.target.value)}
            disabled={!division || districts.status !== "ready"}
            aria-invalid={error && division && !district ? true : undefined}
            aria-describedby={describedBy}
            className={`${SELECT} ${error && division && !district ? "border-danger" : "border-line-strong"}`}
          >
            <option value="">
              {placeholder(districts.status, division ? t("location.chooseDistrict") : t("location.divisionFirst"))}
            </option>
            {district && !districts.items.includes(district) && <option value={district}>{district}</option>}
            {districts.items.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex min-w-0 flex-col gap-1.5">
          <label htmlFor={`${id}-area`} className="text-sm text-ink-soft">
            {t("location.upazila")}
          </label>
          <select
            id={`${id}-area`}
            value={value?.id ?? ""}
            onChange={(event) => chooseArea(event.target.value)}
            disabled={!district || areas.status !== "ready"}
            aria-invalid={error && district && !value ? true : undefined}
            aria-describedby={describedBy}
            className={`${SELECT} ${error && district && !value ? "border-danger" : "border-line-strong"}`}
          >
            <option value="">
              {placeholder(areas.status, district ? t("location.chooseUpazila") : t("location.districtFirst"))}
            </option>
            {value && !areas.items.some((area) => area.id === value.id) && (
              <option value={value.id}>{value.upazila}</option>
            )}
            {cityThanas.length > 0 ? (
              <>
                <optgroup label={fill(t("location.cityThanas"), { district })}>{options(cityThanas)}</optgroup>
                <optgroup label={t("location.upazilas")}>{options(upazilas)}</optgroup>
              </>
            ) : (
              options(upazilas)
            )}
          </select>
        </div>
      </div>
      <p id={hintId} className="text-sm text-ink-muted">
        {t("location.hint")}
      </p>
      {failed && (
        <p role="alert" className="text-sm font-medium text-danger">
          {t("location.error")}{" "}
          <button
            type="button"
            onClick={() => setAttempt((n) => n + 1)}
            className="inline-flex min-h-11 items-center font-semibold text-primary underline"
          >
            {t("location.retry")}
          </button>
        </p>
      )}
      {error && (
        <p id={errorId} className="text-sm font-medium text-danger">
          {error}
        </p>
      )}
    </fieldset>
  );
}
