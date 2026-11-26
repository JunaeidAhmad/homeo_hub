"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import type { ApiClient } from "@/api/client";
import type { components } from "@/api/schema";
import { FormAlert } from "@/components/form/fields";
import type { Locale } from "@/i18n/config";
import type { CommonMessages } from "@/i18n/messages/common";
import { useMessages } from "@/i18n/provider";

type NotificationItem = components["schemas"]["Notification"];

type AreaPaths = {
  list:
    | "/api/v1/notifications/"
    | "/api/v1/doctor/notifications/"
    | "/api/v1/admin/notifications/";
  markRead:
    | "/api/v1/notifications/{id}/read/"
    | "/api/v1/doctor/notifications/{id}/read/"
    | "/api/v1/admin/notifications/{id}/read/";
  markAll:
    | "/api/v1/notifications/read-all/"
    | "/api/v1/doctor/notifications/read-all/"
    | "/api/v1/admin/notifications/read-all/";
};

function relativeTime(locale: Locale, iso: string, justNowLabel: string): string {
  const diffSec = Math.round((new Date(iso).getTime() - Date.now()) / 1000);
  const abs = Math.abs(diffSec);
  if (abs < 45) return justNowLabel;
  try {
    const rtf = new Intl.RelativeTimeFormat(locale === "bn" ? "bn-BD" : "en-US", {
      numeric: "auto",
    });
    if (abs < 3600) return rtf.format(Math.round(diffSec / 60), "minute");
    if (abs < 86_400) return rtf.format(Math.round(diffSec / 3600), "hour");
    return rtf.format(Math.round(diffSec / 86_400), "day");
  } catch {
    return iso;
  }
}

export function Inbox({
  api,
  paths,
}: {
  api: ApiClient;
  paths: AreaPaths;
}) {
  const { locale, t } = useMessages<CommonMessages>();
  const router = useRouter();
  const [items, setItems] = useState<NotificationItem[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [busyAll, setBusyAll] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    api
      .GET(paths.list, {
        params: { query: { page_size: 50 } },
        signal: controller.signal,
      })
      .then(({ data }) => {
        if (data) {
          setItems(data.results);
          setFailed(false);
        } else {
          setFailed(true);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => controller.abort();
  }, [api, paths.list]);

  async function openNotification(item: NotificationItem) {
    if (!item.read_at) {
      setItems((prev) =>
        prev
          ? prev.map((row) =>
              row.id === item.id ? { ...row, read_at: new Date().toISOString() } : row,
            )
          : prev,
      );
      try {
        await api.POST(paths.markRead, { params: { path: { id: item.id } } });
      } catch {
        // Still navigate on failure.
      }
    }
    router.push(item.link || "/");
  }

  async function markAll() {
    if (busyAll) return;
    setBusyAll(true);
    try {
      const { response } = await api.POST(paths.markAll);
      if (response.ok) {
        const now = new Date().toISOString();
        setItems((prev) => (prev ? prev.map((row) => ({ ...row, read_at: row.read_at ?? now })) : prev));
      }
    } finally {
      setBusyAll(false);
    }
  }

  if (failed) {
    return <FormAlert>{t("table.error")}</FormAlert>;
  }

  if (items === null) {
    return (
      <p role="status" className="text-ink-muted">
        {t("table.loading")}
      </p>
    );
  }

  if (items.length === 0) {
    return (
      <p className="rounded-panel border border-line bg-surface px-4 py-8 text-center text-sm text-ink-muted">
        {t("notifications.empty")}
      </p>
    );
  }

  const hasUnread = items.some((item) => !item.read_at);

  return (
    <div className="flex flex-col gap-3">
      {hasUnread && (
        <div className="flex justify-end">
          <button
            type="button"
            disabled={busyAll}
            onClick={() => void markAll()}
            className="min-h-10 rounded-control border border-line-strong bg-surface px-3.5 text-sm font-semibold text-primary disabled:opacity-50"
          >
            {t("notifications.markAll")}
          </button>
        </div>
      )}

      <ul className="divide-y divide-line overflow-hidden rounded-panel border border-line bg-surface">
        {items.map((item) => {
          const unread = !item.read_at;
          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => void openNotification(item)}
                className={`flex w-full flex-col gap-1 px-4 py-3.5 text-left transition-colors hover:bg-mist/50 ${
                  unread ? "border-l-[3px] border-l-primary" : ""
                }`}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className={unread ? "text-base font-bold text-ink" : "text-base font-medium text-ink"}>
                    {item.title}
                  </span>
                  <span className="text-xs text-ink-muted">
                    {relativeTime(locale, item.created_at, t("notifications.justNow"))}
                  </span>
                </div>
                <p className="text-sm text-ink-soft">{item.body}</p>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
