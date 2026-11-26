"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";

import type { ApiClient } from "@/api/client";
import type { components } from "@/api/schema";
import { useApiClient } from "@/api/use-api-client";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import type { CommonMessages } from "@/i18n/messages/common";
import { useMessages } from "@/i18n/provider";

export type RemedyOption = components["schemas"]["RemedyCard"];

const MAX_OPTIONS = 8;

type Search = { query: string; remedies: RemedyOption[] | null };

function useRemedySearch(client: ApiClient, query: string) {
  const [result, setResult] = useState<Search>({ query: "", remedies: [] });

  useEffect(() => {
    if (!query) return;
    const controller = new AbortController();
    client
      .GET("/api/v1/remedies/", {
        params: { query: { q: query, page_size: MAX_OPTIONS } },
        signal: controller.signal,
      })
      .then(({ data }) => setResult({ query, remedies: data?.results ?? null }))
      .catch(() => {
        if (!controller.signal.aborted) setResult({ query, remedies: null });
      });
    return () => controller.abort();
  }, [client, query]);

  if (!query) return { status: "idle" as const, remedies: [] };
  if (result.query !== query) return { status: "loading" as const, remedies: [] };
  if (!result.remedies) return { status: "error" as const, remedies: [] };
  return { status: "ready" as const, remedies: result.remedies };
}

/**
 * Search active remedies as you type and pick one via `onPick`.
 * Used by admin illness ranking and shop price lists.
 */
export function RemedySearch({
  label,
  hint,
  excludeIds = [],
  onPick,
  onPickCustom,
  customOptionLabel,
  client,
}: {
  label: string;
  hint?: string;
  excludeIds?: readonly string[];
  onPick: (remedy: RemedyOption) => void;
  onPickCustom?: (name: string) => void;
  customOptionLabel?: (name: string) => string;
  client?: ApiClient;
}) {
  const { locale, t } = useMessages<CommonMessages>();
  const defaultClient = useApiClient();
  const id = useId();
  const listId = `${id}-list`;
  const hintId = hint ? `${id}-hint` : undefined;

  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);

  const trimmed = text.trim();
  const query = useDebouncedValue(trimmed);
  const { status, remedies } = useRemedySearch(client ?? defaultClient, query);
  const excluded = new Set(excludeIds);
  const available = remedies.filter((item) => !excluded.has(item.id));
  const showPopup = open && trimmed !== "";
  const canCustom = Boolean(
    onPickCustom &&
      trimmed !== "" &&
      status === "ready" &&
      !available.some((item) => item.name.toLowerCase() === trimmed.toLowerCase()),
  );
  const optionCount = available.length + (canCustom ? 1 : 0);
  const listVisible = showPopup && status === "ready" && optionCount > 0;
  const navigable = listVisible && query === trimmed;

  function choose(remedy: RemedyOption) {
    setText("");
    setOpen(false);
    setActive(-1);
    onPick(remedy);
    inputRef.current?.focus();
  }

  function chooseCustom() {
    if (!onPickCustom || !trimmed) return;
    setText("");
    setOpen(false);
    setActive(-1);
    onPickCustom(trimmed);
    inputRef.current?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setOpen(false);
      setActive(-1);
    } else if (event.key === "ArrowDown" && !open && optionCount > 0) {
      event.preventDefault();
      setOpen(true);
    } else if (event.key === "ArrowDown" && navigable) {
      event.preventDefault();
      setActive((index) => Math.min(index + 1, optionCount - 1));
    } else if (event.key === "ArrowUp" && navigable) {
      event.preventDefault();
      setActive((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter" && navigable && active >= 0) {
      event.preventDefault();
      if (active < available.length) {
        choose(available[active]);
      } else if (canCustom) {
        chooseCustom();
      }
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[15px] font-semibold">
        {label}
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
          onChange={(event) => {
            setText(event.target.value);
            setOpen(true);
            setActive(-1);
          }}
          onKeyDown={onKeyDown}
          className="min-h-13 w-full rounded-control border border-line-strong bg-surface pr-12 pl-3.5 text-[17px]"
        />
        {text && (
          <button
            type="button"
            aria-label={t("location.clear")}
            onClick={() => {
              setText("");
              setOpen(false);
              setActive(-1);
              inputRef.current?.focus();
            }}
            className="absolute top-1 right-1 flex size-11 items-center justify-center rounded-control text-ink-muted"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        )}

        {showPopup && (
          <div
            onMouseDown={(event) => event.preventDefault()}
            className="absolute inset-x-0 top-full z-10 mt-1 max-h-[min(60dvh,24rem)] overflow-y-auto rounded-panel border border-line bg-surface shadow-lg"
          >
            {status === "ready" && optionCount > 0 && (
              <ul id={listId} role="listbox" aria-label={label}>
                {available.map((remedy, index) => (
                  <li
                    key={remedy.id}
                    id={`${id}-option-${index}`}
                    role="option"
                    aria-selected={index === active}
                    onClick={() => choose(remedy)}
                    className={`flex min-h-12 cursor-pointer items-center justify-between gap-2 px-3.5 py-2 text-base ${
                      index === active ? "bg-mist" : "hover:bg-mist/60"
                    }`}
                  >
                    <span lang="la" className="font-display italic">
                      {remedy.name}
                    </span>
                    {locale === "bn" && remedy.name_bn && (
                      <span lang="bn" className="text-sm text-ink-muted">
                        {remedy.name_bn}
                      </span>
                    )}
                  </li>
                ))}
                {canCustom && (
                  <li
                    key="__custom__"
                    id={`${id}-option-${available.length}`}
                    role="option"
                    aria-selected={active === available.length}
                    onClick={chooseCustom}
                    className={`flex min-h-12 cursor-pointer items-center justify-between gap-2 border-t border-line px-3.5 py-2 text-base ${
                      active === available.length ? "bg-mist" : "hover:bg-mist/60"
                    }`}
                  >
                    <span className="font-normal text-ink">
                      {customOptionLabel ? customOptionLabel(trimmed) : trimmed}
                    </span>
                  </li>
                )}
              </ul>
            )}
            {status === "loading" && (
              <p role="status" className="px-3.5 py-3 text-ink-muted">
                {t("remedySearch.loading")}
              </p>
            )}
            {status === "ready" && optionCount === 0 && (
              <p role="status" className="px-3.5 py-3 text-ink-muted">
                {t("remedySearch.none")}
              </p>
            )}
            {status === "error" && (
              <p role="alert" className="px-3.5 py-3 text-danger">
                {t("remedySearch.error")}
              </p>
            )}
          </div>
        )}
      </div>
      {hint && (
        <p id={hintId} className="text-sm text-ink-muted">
          {hint}
        </p>
      )}
    </div>
  );
}
