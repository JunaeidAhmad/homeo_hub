"use client";

import { useDoctorSession } from "@/areas/doctor/session";
import { Heading } from "@/components/form/fields";
import { Inbox } from "@/components/notifications/Inbox";
import { PushOptInCard } from "@/components/notifications/PushOptInCard";
import type { CommonMessages } from "@/i18n/messages/common";
import { useMessages } from "@/i18n/provider";

export default function DoctorNotificationsPage() {
  const { t } = useMessages<CommonMessages>();
  const { api } = useDoctorSession();

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <Heading title={t("notifications.title")} />
      <PushOptInCard
        api={api}
        subscribePath="/api/v1/doctor/notifications/push-subscriptions/"
      />
      <Inbox
        api={api}
        paths={{
          list: "/api/v1/doctor/notifications/",
          markRead: "/api/v1/doctor/notifications/{id}/read/",
          markAll: "/api/v1/doctor/notifications/read-all/",
        }}
      />
    </div>
  );
}
