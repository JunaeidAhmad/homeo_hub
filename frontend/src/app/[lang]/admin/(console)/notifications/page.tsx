"use client";

import { useStaffSession } from "@/areas/admin/session";
import { Heading } from "@/components/form/fields";
import { Inbox } from "@/components/notifications/Inbox";
import { PushOptInCard } from "@/components/notifications/PushOptInCard";
import type { CommonMessages } from "@/i18n/messages/common";
import { useMessages } from "@/i18n/provider";

export default function AdminNotificationsPage() {
  const { t } = useMessages<CommonMessages>();
  const { api } = useStaffSession();

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <Heading title={t("notifications.title")} />
      <PushOptInCard
        api={api}
        subscribePath="/api/v1/admin/notifications/push-subscriptions/"
      />
      <Inbox
        api={api}
        paths={{
          list: "/api/v1/admin/notifications/",
          markRead: "/api/v1/admin/notifications/{id}/read/",
          markAll: "/api/v1/admin/notifications/read-all/",
        }}
      />
    </div>
  );
}
