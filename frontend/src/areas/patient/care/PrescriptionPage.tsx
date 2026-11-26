"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import type { components } from "@/api/schema";
import { TaskScreen } from "@/areas/patient/TaskScreen";
import { useCart } from "@/areas/patient/cart/CartProvider";
import { useSession } from "@/areas/patient/session/SessionProvider";
import { FormAlert } from "@/components/form/fields";
import { PrescriptionSheet } from "@/components/prescription/PrescriptionSheet";
import { SealedSheet } from "@/components/prescription/SealedSheet";
import type { PrescriptionSheetData } from "@/components/prescription/types";
import { fill } from "@/i18n/catalog";
import { formatMoney, numberFormat } from "@/i18n/format";
import type { PatientMessages } from "@/i18n/messages/patient";
import { useMessages } from "@/i18n/provider";

type PatientPrescriptionResponse = components["schemas"]["PatientPrescriptionResponse"];

export function PrescriptionPage({ caseId }: { caseId: string }) {
  const { locale, t } = useMessages<PatientMessages>();
  const session = useSession();
  const { api } = session;
  const { replaceCart } = useCart();
  const searchParams = useSearchParams();
  const unsealing = searchParams.get("unlocked") === "1";
  const nf = numberFormat(locale);

  const [data, setData] = useState<PatientPrescriptionResponse | null>(null);
  const [loadStatus, setLoadStatus] = useState<"loading" | "ready" | "error">("loading");
  const [paying, setPaying] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addedCount, setAddedCount] = useState<number | null>(null);
  const [actionError, setActionError] = useState("");

  const isGuest =
    session.status === "signedOut" || (session.status === "unavailable" && !session.hasSession);

  useEffect(() => {
    if (session.status !== "signedIn") return;
    const controller = new AbortController();
    api
      .GET("/api/v1/doctor-consultations/{id}/prescription/", {
        params: { path: { id: caseId } },
        signal: controller.signal,
      })
      .then(({ data: payload }) => {
        if (payload) {
          setData(payload);
          setLoadStatus("ready");
        } else {
          setLoadStatus("error");
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoadStatus("error");
      });
    return () => controller.abort();
  }, [api, caseId, session.status]);

  if (isGuest) {
    return (
      <TaskScreen title={t("patient.rx.title")} backHref={`/care/${caseId}`}>
        <div className="flex flex-col items-center gap-4 rounded-panel border border-line bg-surface p-6 text-center">
          <p className="text-base text-ink-soft">{t("patient.care.guest")}</p>
          <Link
            href={`/signin?next=/care/${caseId}/prescription`}
            className="flex min-h-13 items-center justify-center rounded-control bg-primary px-6 font-bold text-surface"
          >
            {t("patient.cart.signIn")}
          </Link>
        </div>
      </TaskScreen>
    );
  }

  if (loadStatus === "loading" || !data) {
    return (
      <TaskScreen title={t("patient.rx.title")} backHref={`/care/${caseId}`}>
        {loadStatus === "error" ? (
          <FormAlert>{t("patient.rx.notFound")}</FormAlert>
        ) : (
          <p role="status" className="text-ink-muted">
            …
          </p>
        )}
      </TaskScreen>
    );
  }

  async function startInvoicePayment(invoiceId: string) {
    if (paying) return;
    setPaying(true);
    setActionError("");
    try {
      const { data: started, error } = await api.POST("/api/v1/payments/", {
        body: { invoice_id: invoiceId },
      });
      if (started?.gateway_url) {
        window.location.assign(started.gateway_url);
        return;
      }
      const code = (error as { error?: { code?: string } } | undefined)?.error?.code;
      setActionError(
        code ? t("patient.error.generic") : t("patient.error.generic"),
      );
    } catch {
      setActionError(t("patient.error.generic"));
    } finally {
      setPaying(false);
    }
  }

  async function addAllToCart() {
    if (adding) return;
    setAdding(true);
    setActionError("");
    try {
      const { data: result } = await api.POST(
        "/api/v1/doctor-consultations/{id}/prescription/add-to-cart/",
        { params: { path: { id: caseId } } },
      );
      if (result) {
        replaceCart(result.cart);
        setAddedCount(result.added_count);
      } else {
        setActionError(t("patient.error.generic"));
      }
    } catch {
      setActionError(t("patient.error.generic"));
    } finally {
      setAdding(false);
    }
  }

  if (data.locked || "summary" in data) {
    const lockedData = "summary" in data ? data : null;
    if (!lockedData) return null;
    const payAction = (
      <button
        type="button"
        disabled={paying}
        onClick={() => void startInvoicePayment(lockedData.invoice.id)}
        className="flex min-h-[54px] w-full items-center justify-center rounded-control bg-primary px-5 text-[17px] font-bold text-surface disabled:opacity-60"
      >
        {fill(t("patient.rx.payToOpen"), {
          total: formatMoney(locale, lockedData.invoice.total_poisha),
        })}
      </button>
    );

    return (
      <TaskScreen title={t("patient.rx.title")} backHref={`/care/${caseId}`} action={payAction}>
        <div className="flex flex-col gap-4">
          {actionError && <FormAlert>{actionError}</FormAlert>}
          <SealedSheet
            summary={lockedData.summary}
            invoice={lockedData.invoice}
            locale={locale}
            labels={{
              sealedNotice: t("patient.rx.sealedNotice"),
              remedyCount: (count) =>
                fill(t("patient.rx.remedyCount"), { count: nf.format(count) }),
              doctorFee: t("patient.rx.doctorFee"),
              platformFee: t("patient.rx.platformFee"),
              total: t("patient.rx.total"),
            }}
          />
        </div>
      </TaskScreen>
    );
  }

  const rx = data.prescription;
  const buyableCount = rx.items.filter((item) => item.buyable).length;
  const sheetData: PrescriptionSheetData = {
    doctor: rx.doctor,
    version: rx.version,
    issued_at: rx.issued_at,
    report_after_date: rx.report_after_date,
    items: rx.items.map((item) => ({
      id: item.id,
      remedy_name: item.remedy_name,
      remedy_name_bn: item.remedy_name_bn,
      is_catalog: item.is_catalog,
      potency: item.potency,
      form: item.form,
      dosage: item.dosage,
      frequency: item.frequency,
      duration: item.duration,
      unavailable_reason: item.unavailable_reason,
    })),
    advice: rx.advice,
  };

  const cartAction =
    buyableCount > 0 ? (
      <button
        type="button"
        disabled={adding}
        onClick={() => void addAllToCart()}
        className="flex min-h-[54px] w-full items-center justify-center rounded-control bg-primary px-5 text-[17px] font-bold text-surface disabled:opacity-60"
      >
        {fill(t("patient.rx.addAllToCart"), { count: nf.format(buyableCount) })}
      </button>
    ) : undefined;

  return (
    <TaskScreen title={t("patient.rx.title")} backHref={`/care/${caseId}`} action={cartAction}>
      <div className="flex flex-col gap-4">
        {actionError && <FormAlert>{actionError}</FormAlert>}

        <p
          role="status"
          className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-primary/30 bg-surface px-4 py-3 text-sm font-semibold text-primary-deep empty:hidden"
        >
          {addedCount !== null && (
            <>
              <span>
                {fill(t("patient.rx.addedToCart"), { count: nf.format(addedCount) })}
              </span>
              <Link href="/cart" className="text-primary underline">
                {t("patient.rx.viewCart")}
              </Link>
            </>
          )}
        </p>

        <PrescriptionSheet
          prescription={sheetData}
          locale={locale}
          unsealing={unsealing}
          labels={{
            formLabel: {
              PILL: t("patient.remedy.form.PILL"),
              LIQUID: t("patient.remedy.form.LIQUID"),
            },
            notSoldHere: t("patient.rx.notSoldHere"),
            currentlyUnavailable: t("patient.rx.currentlyUnavailable"),
            doTitle: t("patient.remedy.do"),
            dontTitle: t("patient.remedy.dont"),
            reportAfter: (date) => fill(t("patient.rx.reportAfter"), { date }),
            versionLabel: (version) =>
              fill(t("patient.rx.versionLabel"), { version: nf.format(version) }),
            regNoPrefix: t("patient.rx.regNoPrefix"),
            signatureLabel: t("patient.rx.signatureLabel"),
          }}
        />
      </div>
    </TaskScreen>
  );
}
