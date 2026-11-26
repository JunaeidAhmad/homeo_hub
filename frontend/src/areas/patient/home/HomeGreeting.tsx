"use client";

import { useSyncExternalStore } from "react";

import { useSession } from "@/areas/patient/session/SessionProvider";
import { fill } from "@/i18n/catalog";
import type { CommonMessages } from "@/i18n/messages/common";
import type { PatientMessages } from "@/i18n/messages/patient";
import { useMessages } from "@/i18n/provider";

type DayPart = "morning" | "afternoon" | "evening";

function dhakaDayPart(now: Date): DayPart {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      hour: "numeric",
      hourCycle: "h23",
      timeZone: "Asia/Dhaka",
    }).format(now),
  );
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  return "evening";
}

const noSubscription = () => () => {};
const readDayPart = () => dhakaDayPart(new Date());

/** "Good evening, <name>" for a signed-in patient (Dhaka time); the tagline otherwise. */
export function HomeGreeting() {
  const { t } = useMessages<CommonMessages & PatientMessages>();
  const session = useSession();
  // No clock on the server: the greeting appears once the page is running in the browser.
  const part = useSyncExternalStore(noSubscription, readDayPart, () => null);

  const text =
    session.status === "signedIn" && part
      ? fill(t(`patient.home.greeting.${part}`), {
          name: session.patient.full_name,
        })
      : t("app.tagline");

  return <p className="text-base font-medium text-primary">{text}</p>;
}
