"use client";

import type { ApiClient } from "@/api/client";
import { usePushOptIn } from "@/hooks/use-push-opt-in";
import type { CommonMessages } from "@/i18n/messages/common";
import { useMessages } from "@/i18n/provider";

export function PushOptInCard({
  api,
  subscribePath,
  enabled = true,
}: {
  api: ApiClient;
  subscribePath:
    | "/api/v1/notifications/push-subscriptions/"
    | "/api/v1/doctor/notifications/push-subscriptions/"
    | "/api/v1/admin/notifications/push-subscriptions/";
  enabled?: boolean;
}) {
  const { t } = useMessages<CommonMessages>();
  const { state, busy, turnOn, turnOff } = usePushOptIn({
    api,
    subscribePath,
    enabled,
  });

  if (state === "loading" || state === "unsupported") return null;

  if (state === "ios_install") {
    return (
      <div className="rounded-panel border border-amber/40 bg-amber-wash px-4 py-3 text-sm text-ink">
        {t("notifications.pushIosHint")}
      </div>
    );
  }

  if (state === "blocked") {
    return (
      <div className="rounded-panel border border-line bg-mist px-4 py-3 text-sm text-ink-soft">
        {t("notifications.pushBlocked")}
      </div>
    );
  }

  if (state === "on") {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-panel border border-line bg-surface px-4 py-3 text-sm">
        <span className="font-medium text-primary-deep">{t("notifications.pushOn")}</span>
        <button
          type="button"
          disabled={busy}
          onClick={() => void turnOff()}
          className="text-xs font-semibold text-ink-muted underline disabled:opacity-50"
        >
          {t("notifications.pushTurnOff")}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-panel border border-line bg-surface p-4">
      <p className="min-w-0 flex-1 text-sm text-ink-soft">{t("notifications.pushPrompt")}</p>
      <button
        type="button"
        disabled={busy}
        onClick={() => void turnOn()}
        className="min-h-11 rounded-control bg-primary px-4 text-sm font-bold text-surface disabled:opacity-60"
      >
        {t("notifications.pushTurnOn")}
      </button>
    </div>
  );
}
