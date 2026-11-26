"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import type { ApiClient } from "@/api/client";
import { Icon } from "@/components/Icon";
import { fill } from "@/i18n/catalog";
import { numberFormat } from "@/i18n/format";
import type { CommonMessages } from "@/i18n/messages/common";
import { useMessages } from "@/i18n/provider";

const BELL_ICON =
  "M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0";

export function Bell({
  api,
  unreadPath,
  href,
  enabled = true,
}: {
  api: ApiClient;
  unreadPath:
    | "/api/v1/notifications/unread-count/"
    | "/api/v1/doctor/notifications/unread-count/"
    | "/api/v1/admin/notifications/unread-count/";
  href: string;
  enabled?: boolean;
}) {
  const { locale, t } = useMessages<CommonMessages>();
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setInterval> | undefined;
    const controller = new AbortController();

    function refreshCount(signal?: AbortSignal) {
      api
        .GET(unreadPath, { signal })
        .then(({ data }) => {
          if (data && typeof data.unread_count === "number") {
            setCount(data.unread_count);
          }
        })
        .catch(() => {
          // Ignore transient polling failures.
        });
    }

    function startPolling() {
      if (timer) clearInterval(timer);
      if (document.visibilityState === "visible") {
        timer = setInterval(() => {
          if (document.visibilityState === "visible") {
            refreshCount();
          }
        }, 30_000);
      }
    }

    function onVisibilityOrFocus() {
      if (document.visibilityState === "visible") {
        refreshCount();
      }
      startPolling();
    }

    refreshCount(controller.signal);
    startPolling();

    document.addEventListener("visibilitychange", onVisibilityOrFocus);
    window.addEventListener("focus", onVisibilityOrFocus);
    return () => {
      controller.abort();
      if (timer) clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibilityOrFocus);
      window.removeEventListener("focus", onVisibilityOrFocus);
    };
  }, [api, enabled, unreadPath]);

  if (!enabled) return null;

  const countText = numberFormat(locale).format(count);
  const ariaLabel =
    count > 0
      ? fill(t("notifications.unreadBadge"), { count: countText })
      : t("notifications.label");

  return (
    <Link
      href={href}
      aria-label={ariaLabel}
      className="relative flex size-11 flex-none items-center justify-center rounded-control text-ink hover:bg-mist/60"
    >
      <Icon path={BELL_ICON} size={22} strokeWidth={2} />
      {count > 0 && (
        <span
          aria-hidden="true"
          className="absolute top-0.5 right-0.5 flex min-w-5 items-center justify-center rounded-full bg-amber px-1 text-[11px] leading-5 font-bold text-surface"
        >
          {countText}
        </span>
      )}
    </Link>
  );
}
