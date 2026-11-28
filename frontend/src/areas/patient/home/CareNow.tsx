"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";

import type { components } from "@/api/schema";
import { useSession } from "@/areas/patient/session/SessionProvider";
import { ACTIVE_ORDER_STATUSES } from "@/areas/patient/orders/status";
import { fill } from "@/i18n/catalog";
import { formatDateTime, numberFormat } from "@/i18n/format";
import type { CommonMessages } from "@/i18n/messages/common";
import type { PatientMessages } from "@/i18n/messages/patient";
import { useMessages } from "@/i18n/provider";

type Consultation = components["schemas"]["PatientConsultationSummary"];
type Appointment = components["schemas"]["PatientAppointment"];
type OrderCard = components["schemas"]["PatientOrderCard"];
type OrderStatus = components["schemas"]["OrderStatusEnum"];

/** Calls further away than this stay on the case page, not on home. */
const CALL_WINDOW_MS = 24 * 60 * 60 * 1000;
const ORDER_LIMIT = 3;

/** Delivery steps shown under an active order, and which step each status reaches. */
const DELIVERY_STEPS = ["confirmed", "packing", "shipped", "delivered"] as const;
const STEP_REACHED: Partial<Record<OrderStatus, number>> = {
  PENDING: -1,
  PENDING_PAYMENT: -1,
  PAID: -1,
  CONFIRMED: 0,
  PROCESSING: 1,
  SHIPPED: 2,
};

type Row = {
  key: string;
  needsYou: boolean;
  status: string;
  title: string;
  note?: string;
  extra?: ReactNode;
  action: { href: string; label: string; primary: boolean };
};

type Data = {
  cases: Consultation[];
  call: Appointment | null;
  orders: OrderCard[];
};

/**
 * Home's "Your care right now": the things waiting on the patient (questions, a
 * ready prescription), a call within the next day, and orders still on their way.
 * Signed-in patients only; hidden when there is nothing to show.
 */
export function CareNow() {
  const { locale, t } = useMessages<CommonMessages & PatientMessages>();
  const session = useSession();
  const { api } = session;
  const [data, setData] = useState<Data | null>(null);

  useEffect(() => {
    if (session.status !== "signedIn") return;
    const controller = new AbortController();
    const { signal } = controller;
    Promise.all([
      api.GET("/api/v1/consultations/", { signal }).then(({ data }) => data ?? []),
      api
        .GET("/api/v1/appointments/upcoming/", { signal })
        .then(({ data }) =>
          data &&
          (data.status === "IN_PROGRESS" ||
            new Date(data.start_at).getTime() - Date.now() <= CALL_WINDOW_MS)
            ? data
            : null,
        ),
      api
        .GET("/api/v1/orders/", {
          params: {
            query: {
              status: ACTIVE_ORDER_STATUSES.join(","),
              page_size: ORDER_LIMIT,
            },
          },
          signal,
        })
        .then(({ data }) => data?.results ?? []),
    ])
      .then(([cases, call, orders]) => setData({ cases, call, orders }))
      .catch(() => {
        // Home stays useful without this section; the tabs still reach each list.
        if (!signal.aborted) setData(null);
      });
    return () => controller.abort();
  }, [api, session.status]);

  if (session.status !== "signedIn" || !data) return null;

  const nf = numberFormat(locale);
  const rows: Row[] = [];

  for (const item of data.cases) {
    const doctor = item.doctor_name ?? t("patient.home.care.yourHomeopath");
    if (item.status === "AWAITING_PATIENT") {
      rows.push({
        key: `case-${item.id}`,
        needsYou: true,
        status: t("patient.home.care.waitingForYou"),
        title: fill(t("patient.home.care.questionsTitle"), { doctor }),
        note: t("patient.home.care.questionsNote"),
        action: {
          href: `/care/${item.id}`,
          label: t("patient.home.care.answer"),
          primary: true,
        },
      });
    } else if (item.status === "PRESCRIBED") {
      rows.push({
        key: `case-${item.id}`,
        needsYou: true,
        status: t("patient.home.care.prescriptionReady"),
        title: fill(t("patient.home.care.prescriptionTitle"), { doctor }),
        action: {
          href: `/care/${item.id}/prescription`,
          label: t("patient.home.care.openPrescription"),
          primary: true,
        },
      });
    }
  }

  const call = data.call;
  if (call) {
    rows.push({
      key: `call-${call.id}`,
      needsYou: call.status === "IN_PROGRESS",
      status: t(`patient.call.status.${call.status}`),
      title: formatDateTime(locale, call.start_at, {
        weekday: "long",
        day: "numeric",
        month: "long",
        hour: "numeric",
        minute: "2-digit",
      }),
      note: fill(t("patient.home.care.callNote"), {
        minutes: nf.format(call.duration_minutes),
        doctor: call.doctor_name,
      }),
      action: {
        href: `/care/${call.consultation_id}`,
        label: t("patient.home.openCallCase"),
        primary: call.status === "IN_PROGRESS",
      },
    });
  }

  for (const order of data.orders) {
    const reached = STEP_REACHED[order.status] ?? -1;
    rows.push({
      key: `order-${order.id}`,
      needsYou: order.status === "PENDING_PAYMENT",
      status: t(`patient.orders.status.${order.status}`),
      title: fill(t("patient.home.care.orderTitle"), {
        count: nf.format(order.item_count),
        code: order.code,
      }),
      extra:
        reached >= 0 ? (
          <ol
            aria-label={t("patient.home.care.deliveryProgress")}
            className="grid max-w-[460px] grid-cols-4 gap-1"
          >
            {DELIVERY_STEPS.map((step, index) => (
              <li
                key={step}
                aria-current={index === reached ? "step" : undefined}
                className="flex flex-col gap-1.5"
              >
                <span className={`h-1 rounded-sm ${index <= reached ? "bg-primary" : "bg-line"}`} />
                <span
                  className={`text-[13px] ${
                    index === reached ? "font-bold text-primary-deep" : "text-ink-soft"
                  }`}
                >
                  {t(`patient.orders.step.${step}`)}
                </span>
              </li>
            ))}
          </ol>
        ) : undefined,
      action: {
        href: `/orders/${order.id}`,
        label: t("patient.home.care.trackOrder"),
        primary: false,
      },
    });
  }

  if (rows.length === 0) return null;

  return (
    <section aria-labelledby="home-care" className="flex flex-col gap-3.5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="home-care" className="font-display text-[26px] font-normal">
          {t("patient.home.care.title")}
        </h2>
        <Link href="/care" className="text-[15px] font-semibold text-primary underline">
          {t("patient.home.care.history")}
        </Link>
      </div>
      <ul className="divide-y divide-line rounded-panel border border-line bg-surface">
        {rows.map((row) => (
          <li
            key={row.key}
            className="flex flex-col gap-3.5 p-4.5 desktop:flex-row desktop:items-center desktop:gap-6"
          >
            <div className="flex min-w-0 flex-1 flex-col gap-2.5">
              <div className="flex flex-col gap-1">
                <span
                  className={`flex items-center gap-2 text-[15px] font-semibold ${
                    row.needsYou ? "text-amber" : "text-primary"
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`size-2 rounded-full ${row.needsYou ? "bg-amber" : "bg-primary"}`}
                  />
                  {row.status}
                </span>
                <h3 className="text-lg leading-snug font-semibold">{row.title}</h3>
                {row.note && (
                  <p className="text-[15px] leading-normal text-ink-muted">{row.note}</p>
                )}
              </div>
              {row.extra}
            </div>
            <Link
              href={row.action.href}
              className={`inline-flex min-h-12 flex-none items-center justify-center rounded-control px-5 text-base ${
                row.action.primary
                  ? "bg-primary font-bold text-surface"
                  : "border border-line-strong font-semibold text-ink"
              }`}
            >
              {row.action.label}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
