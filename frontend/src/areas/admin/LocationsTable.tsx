"use client";

import { useCallback } from "react";

import type { ApiClient } from "@/api/client";
import type { components } from "@/api/schema";
import { useApiClient } from "@/api/use-api-client";
import { SearchableTable, type Column } from "@/components/SearchableTable";
import { useListQuery, type ListParams } from "@/hooks/use-list-query";
import type { AdminMessages } from "@/i18n/messages/admin";
import type { CommonMessages } from "@/i18n/messages/common";
import { useMessages } from "@/i18n/provider";

type Location = components["schemas"]["Location"];

/** Every area of Bangladesh, searchable and paged. First user of the shared list table. */
export function LocationsTable({ client }: { client?: ApiClient }) {
  const { t } = useMessages<CommonMessages & AdminMessages>();
  const defaultClient = useApiClient();
  const api = client ?? defaultClient;

  const fetchPage = useCallback(
    async ({ q, page, pageSize }: ListParams, signal: AbortSignal) => {
      const { data } = await api.GET("/api/v1/locations/", {
        params: { query: { q: q || undefined, page, page_size: pageSize } },
        signal,
      });
      return data ?? null;
    },
    [api],
  );
  const list = useListQuery<Location>(fetchPage);

  const columns: Column<Location>[] = [
    { key: "division", header: t("admin.locations.division"), cell: (row) => row.division },
    { key: "district", header: t("admin.locations.district"), cell: (row) => row.district },
    { key: "upazila", header: t("admin.locations.upazila"), cell: (row) => row.upazila },
  ];

  return (
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
  );
}
