"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import type { components } from "@/api/schema";
import { useApiClient } from "@/api/use-api-client";
import { TaskScreen } from "@/areas/patient/TaskScreen";
import { useSession } from "@/areas/patient/session/SessionProvider";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { FormAlert } from "@/components/form/fields";
import { fill } from "@/i18n/catalog";
import { formatMoney, numberFormat } from "@/i18n/format";
import type { CommonMessages } from "@/i18n/messages/common";
import type { PatientMessages } from "@/i18n/messages/patient";
import { useMessages } from "@/i18n/provider";

import { OrderTimeline } from "./OrderTimeline";
import { ORDER_STATUS_META } from "./status";

type OrderDetailData = components["schemas"]["PatientOrderDetail"];

export function OrderDetail({ orderId }: { orderId: string }) {
  const { locale, t } = useMessages<CommonMessages & PatientMessages>();
  const session = useSession();
  const api = useApiClient();
  const searchParams = useSearchParams();
  const justPlaced = searchParams.get("placed") === "1";

  const [order, setOrder] = useState<OrderDetailData | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error" | "missing">("loading");
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState("");
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState("");

  const isGuest =
    session.status === "signedOut" || (session.status === "unavailable" && !session.hasSession);

  useEffect(() => {
    if (session.status !== "signedIn") return;
    const controller = new AbortController();
    api
      .GET("/api/v1/orders/{id}/", {
        params: { path: { id: orderId } },
        signal: controller.signal,
      })
      .then(({ data, response }) => {
        if (data) {
          setOrder(data);
          setStatus("ready");
        } else {
          setStatus(response.status === 404 ? "missing" : "error");
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setStatus("error");
      });
    return () => controller.abort();
  }, [api, orderId, session.status]);

  async function startOnlinePayment() {
    if (!order || paying) return;
    setPaying(true);
    setPayError("");
    try {
      const { data } = await api.POST("/api/v1/payments/", {
        body: { order_id: order.id },
      });
      if (data?.gateway_url) {
        window.location.assign(data.gateway_url);
        return;
      }
      setPayError(t("patient.error.generic"));
    } catch {
      setPayError(t("patient.error.generic"));
    } finally {
      setPaying(false);
    }
  }

  async function confirmCancel() {
    if (!order || cancelling) return;
    setCancelling(true);
    setCancelError("");
    try {
      const { data, response } = await api.POST("/api/v1/orders/{id}/cancel/", {
        params: { path: { id: order.id } },
      });
      if (data) {
        setOrder(data);
        setCancelOpen(false);
      } else {
        setCancelError(
          response.status === 409
            ? t("patient.error.ORDER_NOT_CANCELLABLE")
            : t("patient.error.generic"),
        );
      }
    } catch {
      setCancelError(t("patient.error.generic"));
    } finally {
      setCancelling(false);
    }
  }

  const needsPayment = order?.status === "PENDING_PAYMENT";
  const bottomAction =
    needsPayment || order?.can_cancel ? (
      <div className="flex flex-col gap-2">
        {needsPayment && (
          <button
            type="button"
            disabled={paying}
            onClick={() => void startOnlinePayment()}
            className="flex min-h-[54px] w-full items-center justify-center rounded-control bg-primary px-5 text-[17px] font-bold text-surface disabled:opacity-60"
          >
            {t("patient.orders.payNow")}
          </button>
        )}
        {order?.can_cancel && (
          <button
            type="button"
            onClick={() => {
              setCancelError("");
              setCancelOpen(true);
            }}
            className="flex min-h-[54px] w-full items-center justify-center rounded-control border border-danger bg-surface px-5 text-[17px] font-bold text-danger"
          >
            {t("patient.orders.cancel")}
          </button>
        )}
      </div>
    ) : undefined;

  return (
    <TaskScreen
      title={order?.code ?? t("patient.orders.title")}
      backHref="/orders"
      action={bottomAction}
    >
      {isGuest ? (
        <div className="flex flex-col items-center gap-4 rounded-panel border border-line bg-surface p-6 text-center">
          <p className="text-base text-ink-soft">{t("patient.orders.guest")}</p>
          <Link
            href={`/signin?next=/orders/${orderId}`}
            className="flex min-h-13 items-center justify-center rounded-control bg-primary px-6 font-bold text-surface"
          >
            {t("patient.cart.signIn")}
          </Link>
        </div>
      ) : session.status !== "signedIn" || status === "loading" ? (
        <p role="status" className="text-ink-muted">
          {t("table.loading")}
        </p>
      ) : status === "missing" ? (
        <p role="status" className="text-ink-muted">
          {t("patient.orders.notFound")}
        </p>
      ) : status === "error" || !order ? (
        <FormAlert>{t("table.error")}</FormAlert>
      ) : (
        <div className="flex flex-col gap-5">
          {justPlaced && order.status !== "PENDING_PAYMENT" && (
            <div
              role="status"
              className="rounded-panel border border-primary/30 bg-primary/10 px-4 py-3 font-semibold text-primary-deep"
            >
              {fill(t("patient.orders.placedBanner"), {
                total: formatMoney(locale, order.total_poisha),
              })}
            </div>
          )}

          {order.status === "PENDING_PAYMENT" && (
            <div
              role="status"
              className="rounded-panel border border-amber/30 bg-amber-wash px-4 py-3 font-semibold text-ink"
            >
              {t("patient.orders.payNowBanner")}
            </div>
          )}

          {payError && <FormAlert>{payError}</FormAlert>}

          <section className="flex flex-col gap-4 rounded-panel border border-line bg-surface p-4 desktop:p-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h1 className="font-display text-2xl font-normal">{order.code}</h1>
              <span
                className={`rounded-control px-3 py-1 text-sm font-semibold ${ORDER_STATUS_META[order.status].badgeClass}`}
              >
                {t(ORDER_STATUS_META[order.status].labelKey)}
              </span>
            </div>
            <OrderTimeline status={order.status} timeline={order.timeline} />
          </section>

          <section className="flex flex-col gap-3 rounded-panel border border-line bg-surface p-4 desktop:p-6">
            <h2 className="font-display text-xl font-normal">{t("patient.orders.itemsHeading")}</h2>
            <ul className="flex flex-col gap-3">
              {order.items.map((item) => (
                <li
                  key={item.id}
                  className="flex items-start justify-between gap-3 border-b border-line pb-3 last:border-b-0 last:pb-0"
                >
                  <div className="flex flex-col gap-0.5">
                    {item.remedy_slug ? (
                      <Link
                        href={`/remedies/${item.remedy_slug}`}
                        lang="la"
                        className="font-display text-lg italic hover:underline"
                      >
                        {item.remedy_name}
                      </Link>
                    ) : (
                      <span lang="la" className="font-display text-lg italic">
                        {item.remedy_name}
                      </span>
                    )}
                    <span className="text-sm text-ink-soft">
                      {item.potency ? `${item.potency} · ` : ""}
                      {item.form ? t(`patient.remedy.form.${item.form}`) : ""} ×{" "}
                      {numberFormat(locale).format(item.quantity)} (
                      {formatMoney(locale, item.unit_price_poisha)})
                    </span>
                  </div>
                  <span className="font-display text-lg whitespace-nowrap">
                    {formatMoney(locale, item.line_total_poisha)}
                  </span>
                </li>
              ))}
            </ul>

            <div className="flex flex-col gap-1.5 border-t border-line pt-3 text-base">
              <div className="flex justify-between">
                <span className="text-ink-soft">{t("patient.cart.subtotal")}</span>
                <span>{formatMoney(locale, order.subtotal_poisha)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-soft">{t("patient.checkout.deliveryCharge")}</span>
                <span>{formatMoney(locale, order.delivery_charge_poisha)}</span>
              </div>
              <div className="flex items-baseline justify-between border-t border-line pt-2">
                <span className="font-semibold">{t("patient.checkout.total")}</span>
                <span className="font-display text-2xl font-normal">
                  {formatMoney(locale, order.total_poisha)}
                </span>
              </div>
            </div>
          </section>

          <section className="flex flex-col gap-2 rounded-panel border border-line bg-surface p-4 desktop:p-6">
            <h2 className="font-display text-xl font-normal">{t("patient.checkout.delivery")}</h2>
            <p className="font-semibold">{order.shipping_address.recipient_name}</p>
            <p className="text-ink-soft">{order.shipping_address.phone}</p>
            <p className="text-ink-soft">{order.shipping_address.address_line}</p>
            <p className="text-sm text-ink-muted">
              {locale === "bn" ? order.shipping_address.area_bn : order.shipping_address.area_en}
            </p>
            <p className="mt-2 border-t border-line pt-2 text-sm text-ink-soft">
              {t("patient.checkout.paymentMethod")}:{" "}
              <strong className="font-semibold text-ink">
                {t(
                  order.payment_method === "COD"
                    ? "patient.checkout.cod"
                    : "patient.checkout.online",
                )}
              </strong>
            </p>
          </section>

          <ConfirmDialog
            open={cancelOpen}
            title={t("patient.orders.cancelTitle")}
            body={t("patient.orders.cancelBody")}
            confirmLabel={t("patient.orders.confirmCancel")}
            cancelLabel={t("patient.orders.keepOrder")}
            tone="danger"
            pending={cancelling}
            error={cancelError}
            onConfirm={() => void confirmCancel()}
            onClose={() => setCancelOpen(false)}
          />
        </div>
      )}
    </TaskScreen>
  );
}
