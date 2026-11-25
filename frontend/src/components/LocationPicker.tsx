"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";

import type { ApiClient } from "@/api/client";
import type { components } from "@/api/schema";
import { useApiClient } from "@/api/use-api-client";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import type { CommonMessages } from "@/i18n/messages/common";
import { useMessages } from "@/i18n/provider";

type Location = components["schemas"]["Location"];

const MAX_OPTIONS = 8;

type Search = { query: string; areas: Location[] | null }; // areas: null = the request failed

/** Search areas as you type. Returns what to show for `query` (empty = no search). */
function useAreaSearch(client: ApiClient, query: string) {
  const [result, setResult] = useState<Search>({ query: "", areas: [] });

  useEffect(() => {
    if (!query) return;
    const controller = new AbortController();
    client
      .GET("/api/v1/locations/", {
        params: { query: { q: query, page_size: MAX_OPTIONS } },
        signal: controller.signal,
      })
      .then(({ data }) => setResult({ query, areas: data?.results ?? null }))
      .catch(() => {
        if (!controller.signal.aborted) setResult({ query, areas: null });
      });
    return () => controller.abort();
  }, [client, query]);

  if (!query) return { status: "idle" as const, areas: [] };
  if (result.query !== query) return { status: "loading" as const, areas: [] };
  if (!result.areas) return { status: "error" as const, areas: [] };
  return { status: "ready" as const, areas: result.areas };
}

/**
 * Pick a Bangladesh area by typing any part of its name, in Bangla or English; typos
 * are forgiven. `value` is the chosen area; editing the text forgets it (`onChange(null)`).
 */
export function LocationPicker({
  value,
  onChange,
  client,
}: {
  value: Location | null;
  onChange: (area: Location | null) => void;
  /** Defaults to a client in the page's language; tests pass their own. */
  client?: ApiClient;
}) {
  const { t } = useMessages<CommonMessages>();
  const defaultClient = useApiClient();
  const id = useId();
  const listId = `${id}-list`;
  const hintId = `${id}-hint`;

  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(value?.display_name ?? "");
  const [searching, setSearching] = useState(false); // the user is typing, not just showing a chosen area
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);

  // An area chosen from outside later (e.g. a profile that finished loading) shows up too.
  const [shownValue, setShownValue] = useState(value);
  if (value !== shownValue) {
    setShownValue(value);
    if (value) {
      setText(value.display_name);
      setSearching(false);
    }
  }

  const query = useDebouncedValue(searching ? text.trim() : "");
  const { status, areas } = useAreaSearch(client ?? defaultClient, query);
  const showPopup = open && searching && text.trim() !== "";
  const listVisible = showPopup && status === "ready" && areas.length > 0;
  // Results belong to the text only once typing has paused; until then keys do nothing.
  const navigable = listVisible && query === text.trim();

  function choose(area: Location) {
    setText(area.display_name);
    setSearching(false);
    setOpen(false);
    setActive(-1);
    onChange(area);
  }

  function edit(next: string) {
    setText(next);
    setSearching(true);
    setOpen(true);
    setActive(-1);
    if (value) onChange(null);
  }

  function clear() {
    setText("");
    setSearching(false);
    setOpen(false);
    onChange(null);
    inputRef.current?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setOpen(false);
      setActive(-1);
    } else if (event.key === "ArrowDown" && searching && !open && areas.length > 0) {
      event.preventDefault();
      setOpen(true); // bring a closed list back
    } else if (event.key === "ArrowDown" && navigable) {
      event.preventDefault();
      setActive((index) => Math.min(index + 1, areas.length - 1));
    } else if (event.key === "ArrowUp" && navigable) {
      event.preventDefault();
      setActive((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter" && navigable && active >= 0) {
      event.preventDefault();
      choose(areas[active]);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-[15px] font-semibold">
        {t("location.label")}
      </label>
      <div
        className="relative"
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
        }}
      >
        <input
          id={id}
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={listVisible}
          aria-controls={listVisible ? listId : undefined}
          aria-autocomplete="list"
          aria-describedby={hintId}
          aria-activedescendant={listVisible && active >= 0 ? `${id}-option-${active}` : undefined}
          autoComplete="off"
          value={text}
          onChange={(event) => edit(event.target.value)}
          onKeyDown={onKeyDown}
          className="min-h-13 w-full rounded-control border border-line-strong bg-surface pr-12 pl-3.5 text-[17px]"
        />
        {text && (
          <button
            type="button"
            aria-label={t("location.clear")}
            onClick={clear}
            className="absolute top-1 right-1 flex size-11 items-center justify-center rounded-control text-ink-muted"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        )}

        {showPopup && (
          <div
            // Keep focus in the input while choosing with the mouse or a finger.
            onMouseDown={(event) => event.preventDefault()}
            className="absolute inset-x-0 top-full z-10 mt-1 max-h-[min(60dvh,24rem)] overflow-y-auto rounded-panel border border-line bg-surface shadow-lg"
          >
            {status === "ready" && areas.length > 0 && (
              <ul id={listId} role="listbox" aria-label={t("location.label")}>
                {areas.map((area, index) => (
                  <li
                    key={area.id}
                    id={`${id}-option-${index}`}
                    role="option"
                    aria-selected={index === active}
                    onClick={() => choose(area)}
                    className={`flex min-h-12 cursor-pointer items-center px-3.5 py-2 text-base ${
                      index === active ? "bg-mist" : "hover:bg-mist/60"
                    }`}
                  >
                    <span>
                      <strong className="font-semibold">{area.upazila}</strong>
                      {`, ${area.district}, ${area.division}`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {status === "loading" && <p role="status" className="px-3.5 py-3 text-ink-muted">{t("location.loading")}</p>}
            {status === "ready" && areas.length === 0 && <p role="status" className="px-3.5 py-3 text-ink-muted">{t("location.none")}</p>}
            {status === "error" && <p role="alert" className="px-3.5 py-3 text-danger">{t("location.error")}</p>}
          </div>
        )}
      </div>
      <p id={hintId} className="text-sm text-ink-muted">
        {t("location.hint")}
      </p>
    </div>
  );
}
