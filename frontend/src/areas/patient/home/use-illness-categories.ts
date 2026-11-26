"use client";

import { useEffect, useState } from "react";

import type { components } from "@/api/schema";
import { useApiClient } from "@/api/use-api-client";

export type IllnessCategory = components["schemas"]["PublicIllnessCategory"];

type State =
  | { status: "loading"; categories: [] }
  | { status: "ready"; categories: IllnessCategory[] }
  | { status: "error"; categories: [] };

/**
 * Public illness categories (with their illnesses) for the home page. The illness
 * picker and the common-illness grid both read it, so the request is shared:
 * one fetch per page load (a language switch reloads the page).
 */
let shared: Promise<IllnessCategory[] | null> | null = null;

export function useIllnessCategories(): State {
  const api = useApiClient();
  const [state, setState] = useState<State>({
    status: "loading",
    categories: [],
  });

  useEffect(() => {
    let live = true;
    shared ??= api
      .GET("/api/v1/illness-categories/")
      .then(({ data }) => data ?? null)
      .catch(() => null);
    const request = shared;
    void request.then((data) => {
      if (request === shared && data === null) shared = null; // let a later mount retry
      if (!live) return;
      setState(data ? { status: "ready", categories: data } : { status: "error", categories: [] });
    });
    return () => {
      live = false;
    };
  }, [api]);

  return state;
}
