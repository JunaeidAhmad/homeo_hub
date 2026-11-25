"use client";

import { useEffect, useState } from "react";

import { useDebouncedValue } from "./use-debounced-value";

export type ListStatus = "loading" | "ready" | "error";
export type ListParams = { q: string; page: number; pageSize: number };
export type ListPage<T> = { count: number; results: T[] };

/**
 * State for a searchable, paginated list that follows the API's list convention
 * (`?q=&page=&page_size=`). Typing waits for a pause before asking the API, and a new
 * search always starts again at page 1. `fetchPage` must be stable (wrap it in useCallback).
 * It resolves to `null` when the request failed.
 */
export function useListQuery<T>(
  fetchPage: (params: ListParams, signal: AbortSignal) => Promise<ListPage<T> | null>,
  pageSize = 20,
) {
  const [query, setQuery] = useState("");
  const searched = useDebouncedValue(query.trim());

  // Remember which search a page number belongs to: a new search is back on page 1.
  const [chosen, setChosen] = useState({ page: 1, searched: "" });
  const page = chosen.searched === searched ? chosen.page : 1;
  const setPage = (next: number) => setChosen({ page: next, searched });

  const [attempt, setAttempt] = useState(0);
  const retry = () => setAttempt((n) => n + 1);

  const key = `${searched}|${page}|${attempt}`;
  const [result, setResult] = useState<{ key: string; data: ListPage<T> | null } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetchPage({ q: searched, page, pageSize }, controller.signal)
      .then((data) => setResult({ key, data }))
      .catch(() => {
        if (!controller.signal.aborted) setResult({ key, data: null });
      });
    return () => controller.abort();
  }, [fetchPage, key, searched, page, pageSize]);

  const status: ListStatus = result?.key !== key ? "loading" : result.data ? "ready" : "error";
  return {
    query,
    setQuery,
    page,
    setPage,
    retry,
    pageSize,
    // While the next page loads, keep showing the last one.
    rows: result?.data?.results ?? [],
    total: result?.data?.count ?? 0,
    status,
  };
}
