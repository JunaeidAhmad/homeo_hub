"use client";

import { useMemo } from "react";

import { useMessages } from "@/i18n/provider";

import { createApiClient, type ApiClient } from "./client";

/** An API client for client components, speaking the language the page is shown in. */
export function useApiClient(): ApiClient {
  const { locale } = useMessages();
  return useMemo(() => createApiClient({ language: locale }), [locale]);
}
