"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import type { components } from "@/api/schema";
import { useApiClient } from "@/api/use-api-client";
import { ActionBar } from "@/areas/patient/ActionBar";
import { TaskScreen } from "@/areas/patient/TaskScreen";
import { useSession } from "@/areas/patient/session/SessionProvider";
import { Icon } from "@/components/Icon";
import { FormAlert } from "@/components/form/fields";
import { formatMoney } from "@/i18n/format";
import type { CommonMessages } from "@/i18n/messages/common";
import type { PatientMessages } from "@/i18n/messages/patient";
import { useMessages } from "@/i18n/provider";

type PaymentStatusData = components["schemas"]["PatientPaymentStatus"];

const CHECK_ICON = "M5 13l4 4L19 7";
const CROSS_ICON = "M6 6l12 12M18 6L6 18";
const CLOCK_ICON = "M12 6v6l4 2M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z";

export function PaymentResult() {
  const { locale, t } = useMessages<CommonMessages & PatientMessages>();
  const session = useSession();
  const api = useApiClient();
  const searchParams = useSearchParams();
  const tranId = searchParams.get("tran_id") ?? "";

  const [payment, setPayment] = useState<PaymentStatusData | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [timedOut, setTimedOut] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState("");

  const isGuest =
    session.status === "signedOut" || (session.status === "unavailable" && !session.hasSession);

  useEffect(() => {
    if (session.status !== "signedIn" || !tranId) return;
    let active = true;
    const controller = new AbortController();
    const startedAt = Date.now();
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function poll() {
      try {
        const { data, response } = await api.GET("/api/v1/payments/{tran_id}/", {
          params: { path: { tran_id: tranId } },
          signal: controller.signal,
        });
        if (!active) return;
        if (!data || response.status >= 400) {
          setLoadState("error");
          return;
        }
        setPayment(data);
        setLoadState("ready");

        if (data.status === "PENDING" || data.status === "INITIATED") {
          if (Date.now() - startedAt >= 30_000) {
            setTimedOut(true);
          } else {
            timer = setTimeout(() => void poll(), 2000);
          }
        }
      } catch {
        if (active && !controller.signal.aborted) setLoadState("error");
      }
    }

    void poll();
    return () => {
      active = false;
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [api, session.status, tranId]);

  async function retryPayment() {
    if (!payment || retrying) return;
    if (!payment.order_id && !payment.invoice_id) return;
    setRetrying(true);
    setRetryError("");
    try {
      const { data } = await api.POST("/api/v1/payments/", {
        body: payment.invoice_id
          ? { invoice_id: payment.invoice_id }
          : { order_id: payment.order_id },
      });
      if (data?.gateway_url) {
        window.location.assign(data.gateway_url);
        return;
      }
      setRetryError(t("patient.error.generic"));
    } catch {
      setRetryError(t("patient.error.generic"));
    } finally {
      setRetrying(false);
    }
  }

  const canRetry =
    payment &&
    (payment.order_id || payment.invoice_id) &&
    (payment.status === "FAILED" || payment.status === "CANCELLED" || payment.status === "EXPIRED");

  const showRetryAction = canRetry ? (
    <ActionBar>
      <button
        type="button"
        disabled={retrying}
        onClick={() => void retryPayment()}
        className="flex min-h-[54px] w-full items-center justify-center rounded-control bg-primary px-5 text-[17px] font-bold text-surface disabled:opacity-60"
      >
        {t("patient.payment.tryAgain")}
      </button>
    </ActionBar>
  ) : undefined;

  const backHref = payment?.consultation_id ? `/care/${payment.consultation_id}` : "/orders";

  return (
    <TaskScreen title={t("patient.payment.title")} backHref={backHref} action={showRetryAction}>
      {isGuest ? (
        <div className="flex flex-col items-center gap-4 rounded-panel border border-line bg-surface p-6 text-center">
          <p className="text-base text-ink-soft">{t("patient.orders.guest")}</p>
          <Link
            href={`/signin?next=${encodeURIComponent(`/payments/result?tran_id=${tranId}`)}`}
            className="flex min-h-13 items-center justify-center rounded-control bg-primary px-6 font-bold text-surface"
          >
            {t("patient.cart.signIn")}
          </Link>
        </div>
      ) : !tranId ? (
        <FormAlert>{t("patient.payment.missing")}</FormAlert>
      ) : session.status !== "signedIn" || loadState === "loading" ? (
        <p role="status" className="text-ink-muted">
          {t("patient.payment.checking")}
        </p>
      ) : loadState === "error" || !payment ? (
        <FormAlert>{t("patient.payment.missing")}</FormAlert>
      ) : (
        <div className="flex flex-col items-center gap-5 rounded-panel border border-line bg-surface p-6 text-center desktop:p-8">
          {retryError && <FormAlert>{retryError}</FormAlert>}

          {payment.status === "SUCCESS" && (
            <>
              <span className="flex size-16 items-center justify-center rounded-full bg-primary text-surface">
                <Icon path={CHECK_ICON} size={32} strokeWidth={2.4} />
              </span>
              <div className="flex flex-col gap-1">
                <h1 className="font-display text-3xl font-normal">
                  {t("patient.payment.successTitle")}
                </h1>
                <p className="font-display text-2xl text-primary-deep">
                  {formatMoney(locale, payment.amount_poisha)}
                </p>
              </div>
              <div className="flex flex-wrap justify-center gap-3 pt-2">
                {payment.consultation_id ? (
                  <>
                    <Link
                      href={`/care/${payment.consultation_id}/prescription?unlocked=1`}
                      className="flex min-h-13 items-center justify-center rounded-control bg-primary px-6 font-bold text-surface"
                    >
                      {t("patient.payment.openPrescription")}
                    </Link>
                    <Link
                      href={`/care/${payment.consultation_id}`}
                      className="flex min-h-11 items-center justify-center rounded-control border border-line-strong bg-surface px-5 font-semibold"
                    >
                      {t("patient.payment.backCase")}
                    </Link>
                  </>
                ) : (
                  <>
                    {payment.order_id && (
                      <Link
                        href={`/orders/${payment.order_id}`}
                        className="flex min-h-13 items-center justify-center rounded-control bg-primary px-6 font-bold text-surface"
                      >
                        {t("patient.payment.viewOrder")}
                      </Link>
                    )}
                    <Link
                      href="/remedies"
                      className="flex min-h-11 items-center justify-center rounded-control border border-line-strong bg-surface px-5 font-semibold"
                    >
                      {t("patient.payment.backRemedies")}
                    </Link>
                  </>
                )}
              </div>
            </>
          )}

          {payment.status === "FAILED" && (
            <>
              <span className="flex size-16 items-center justify-center rounded-full bg-danger text-surface">
                <Icon path={CROSS_ICON} size={30} strokeWidth={2.4} />
              </span>
              <h1 className="font-display text-3xl font-normal">
                {t("patient.payment.failedTitle")}
              </h1>
              {payment.consultation_id ? (
                <Link
                  href={`/care/${payment.consultation_id}/prescription`}
                  className="font-semibold text-primary underline"
                >
                  {t("patient.payment.openPrescription")}
                </Link>
              ) : (
                payment.order_id && (
                  <Link
                    href={`/orders/${payment.order_id}`}
                    className="font-semibold text-primary underline"
                  >
                    {t("patient.payment.viewOrder")}
                  </Link>
                )
              )}
            </>
          )}

          {payment.status === "CANCELLED" && (
            <>
              <span className="flex size-16 items-center justify-center rounded-full bg-mist text-ink-muted">
                <Icon path={CROSS_ICON} size={30} strokeWidth={2.4} />
              </span>
              <h1 className="font-display text-3xl font-normal">
                {t("patient.payment.cancelledTitle")}
              </h1>
              {payment.consultation_id ? (
                <Link
                  href={`/care/${payment.consultation_id}/prescription`}
                  className="flex min-h-11 items-center justify-center rounded-control border border-line-strong bg-surface px-5 font-semibold"
                >
                  {t("patient.payment.openPrescription")}
                </Link>
              ) : (
                payment.order_id && (
                  <Link
                    href={`/orders/${payment.order_id}`}
                    className="flex min-h-11 items-center justify-center rounded-control border border-line-strong bg-surface px-5 font-semibold"
                  >
                    {t("patient.payment.viewOrder")}
                  </Link>
                )
              )}
            </>
          )}

          {(payment.status === "PENDING" ||
            payment.status === "INITIATED" ||
            payment.status === "EXPIRED") && (
            <>
              <span className="flex size-16 items-center justify-center rounded-full bg-amber-wash text-amber">
                <Icon path={CLOCK_ICON} size={30} strokeWidth={2.2} />
              </span>
              <h1 className="font-display text-2xl font-normal">
                {timedOut || payment.status === "EXPIRED"
                  ? t("patient.payment.pendingLong")
                  : t("patient.payment.checking")}
              </h1>
              {payment.consultation_id ? (
                <Link
                  href={`/care/${payment.consultation_id}/prescription`}
                  className="flex min-h-11 items-center justify-center rounded-control border border-line-strong bg-surface px-5 font-semibold"
                >
                  {t("patient.payment.openPrescription")}
                </Link>
              ) : (
                payment.order_id && (
                  <Link
                    href={`/orders/${payment.order_id}`}
                    className="flex min-h-11 items-center justify-center rounded-control border border-line-strong bg-surface px-5 font-semibold"
                  >
                    {t("patient.payment.viewOrder")}
                  </Link>
                )
              )}
            </>
          )}
        </div>
      )}
    </TaskScreen>
  );
}
