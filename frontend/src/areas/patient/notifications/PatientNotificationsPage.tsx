"use client";

import Link from "next/link";

import { TaskScreen } from "@/areas/patient/TaskScreen";
import { useSession } from "@/areas/patient/session/SessionProvider";
import { Inbox } from "@/components/notifications/Inbox";
import { PushOptInCard } from "@/components/notifications/PushOptInCard";
import type { CommonMessages } from "@/i18n/messages/common";
import type { PatientMessages } from "@/i18n/messages/patient";
import { useMessages } from "@/i18n/provider";

export function PatientNotificationsPage() {
  const { t } = useMessages<CommonMessages & PatientMessages>();
  const session = useSession();

  const isGuest =
    session.status === "signedOut" || (session.status === "unavailable" && !session.hasSession);

  return (
    <TaskScreen title={t("notifications.title")} backHref="/">
      {isGuest ? (
        <div className="flex flex-col items-center gap-4 rounded-panel border border-line bg-surface p-6 text-center">
          <p className="text-base text-ink-soft">{t("patient.care.guest")}</p>
          <Link
            href="/signin?next=/notifications"
            className="flex min-h-13 items-center justify-center rounded-control bg-primary px-6 font-bold text-surface"
          >
            {t("patient.cart.signIn")}
          </Link>
        </div>
      ) : session.status !== "signedIn" ? (
        <p role="status" className="text-ink-muted">
          {t("table.loading")}
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          <PushOptInCard
            api={session.api}
            subscribePath="/api/v1/notifications/push-subscriptions/"
          />
          <Inbox
            api={session.api}
            paths={{
              list: "/api/v1/notifications/",
              markRead: "/api/v1/notifications/{id}/read/",
              markAll: "/api/v1/notifications/read-all/",
            }}
          />
        </div>
      )}
    </TaskScreen>
  );
}
