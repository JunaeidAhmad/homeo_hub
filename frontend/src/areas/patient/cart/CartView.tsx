"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

import { TaskScreen } from "@/areas/patient/TaskScreen";
import { useSession } from "@/areas/patient/session/SessionProvider";
import { FormAlert } from "@/components/form/fields";
import { RemedyVial } from "@/components/RemedyVial";
import { formatMoney, numberFormat } from "@/i18n/format";
import type { CommonMessages } from "@/i18n/messages/common";
import type { PatientMessages } from "@/i18n/messages/patient";
import { useMessages } from "@/i18n/provider";

import { useCart } from "./CartProvider";

/** Interactive patient cart: quantity stepper, remove, unavailable notice, and checkout bar. */
export function CartView() {
  const { locale, t } = useMessages<CommonMessages & PatientMessages>();
  const session = useSession();
  const { cart, loading, error, setQuantity, remove } = useCart();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");

  async function changeQuantity(itemId: string, quantity: number) {
    setBusyId(itemId);
    setActionError("");
    const result = await setQuantity(itemId, quantity);
    if (!result.ok) setActionError(t("patient.cart.updateFailed"));
    setBusyId(null);
  }

  async function removeItem(itemId: string) {
    setBusyId(itemId);
    setActionError("");
    const result = await remove(itemId);
    if (!result.ok) setActionError(t("patient.cart.updateFailed"));
    setBusyId(null);
  }

  const isGuest =
    session.status === "signedOut" || (session.status === "unavailable" && !session.hasSession);
  const items = cart?.items ?? [];
  const hasUnavailable = items.some((item) => !item.available);
  const canCheckout =
    session.status === "signedIn" && items.length > 0 && !hasUnavailable && !busyId;

  const checkoutAction =
    session.status === "signedIn" && items.length > 0 ? (
      canCheckout ? (
        <Link
          href="/checkout"
          className="flex min-h-[54px] w-full items-center justify-center rounded-control bg-primary text-[17px] font-bold text-surface"
        >
          {t("patient.cart.checkout")}
        </Link>
      ) : (
        <button
          type="button"
          disabled
          className="flex min-h-[54px] w-full cursor-not-allowed items-center justify-center rounded-control bg-primary text-[17px] font-bold text-surface opacity-50"
        >
          {t("patient.cart.checkout")}
        </button>
      )
    ) : undefined;

  return (
    <TaskScreen title={t("patient.cart.title")} backHref="/remedies" action={checkoutAction}>
      {isGuest ? (
        <div className="flex flex-col items-center gap-4 rounded-panel border border-line bg-surface p-6 text-center">
          <RemedyVial name="HomeoHub" />
          <p className="text-base text-ink-soft">{t("patient.cart.guest")}</p>
          <Link
            href="/signin?next=/cart"
            className="flex min-h-13 items-center justify-center rounded-control bg-primary px-6 font-bold text-surface"
          >
            {t("patient.cart.signIn")}
          </Link>
        </div>
      ) : session.status === "loading" || (!cart && loading) ? (
        <p role="status" className="text-ink-muted">
          {t("table.loading")}
        </p>
      ) : error && !cart ? (
        <FormAlert>{t("table.error")}</FormAlert>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-panel border border-line bg-surface p-6 text-center">
          <RemedyVial name="HomeoHub" />
          <p className="font-display text-2xl">{t("patient.cart.empty")}</p>
          <Link
            href="/remedies"
            className="flex min-h-13 items-center justify-center rounded-control bg-primary px-6 font-bold text-surface"
          >
            {t("patient.cart.browse")}
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {actionError && <FormAlert>{actionError}</FormAlert>}
          <ul className="flex flex-col gap-3">
            {items.map((item) => {
              const busy = busyId === item.id;
              const max = cart?.max_quantity ?? 10;
              return (
                <li
                  key={item.id}
                  className="flex flex-col gap-3 rounded-panel border border-line bg-surface p-4"
                >
                  {!item.available && (
                    <p role="status" className="rounded-control bg-amber-wash px-3 py-2 text-sm font-semibold text-ink">
                      {t("patient.cart.unavailableLine")}
                    </p>
                  )}
                  <div className="flex gap-3.5">
                    <Link
                      href={`/remedies/${item.remedy.slug}`}
                      className="flex h-20 w-16 flex-none items-center justify-center overflow-hidden rounded-control bg-mist"
                    >
                      {item.remedy.picture_url ? (
                        <Image
                          unoptimized
                          src={item.remedy.picture_url}
                          alt=""
                          width={64}
                          height={80}
                          className="size-full object-contain"
                        />
                      ) : (
                        <RemedyVial name={item.remedy.name} size="small" form={item.form} />
                      )}
                    </Link>
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <div className="flex items-start justify-between gap-2">
                        <Link
                          href={`/remedies/${item.remedy.slug}`}
                          className="min-w-0 hover:underline"
                        >
                          <span lang="la" className="font-display text-xl leading-tight italic">
                            {item.remedy.name}
                          </span>
                        </Link>
                        {item.available && (
                          <span className="font-display text-lg font-normal whitespace-nowrap">
                            {formatMoney(locale, item.line_total_poisha)}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-ink-soft">
                        {item.potency} · {t(`patient.remedy.form.${item.form}`)}
                      </p>
                      {(item.source_label || item.illness_name) && (
                        <p className="text-sm text-ink-muted">
                          {item.source_label ?? item.illness_name}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={busy || item.quantity <= 1}
                        aria-label={t("patient.cart.decrease")}
                        onClick={() => void changeQuantity(item.id, item.quantity - 1)}
                        className="flex size-11 items-center justify-center rounded-control border border-line-strong bg-surface text-lg font-bold disabled:opacity-40"
                      >
                        −
                      </button>
                      <span className="min-w-8 text-center font-semibold">
                        {numberFormat(locale).format(item.quantity)}
                      </span>
                      <button
                        type="button"
                        disabled={busy || item.quantity >= max}
                        aria-label={t("patient.cart.increase")}
                        onClick={() => void changeQuantity(item.id, item.quantity + 1)}
                        className="flex size-11 items-center justify-center rounded-control border border-line-strong bg-surface text-lg font-bold disabled:opacity-40"
                      >
                        +
                      </button>
                      {item.quantity >= max && (
                        <span className="text-xs text-ink-muted">{t("patient.cart.maxNote")}</span>
                      )}
                    </div>

                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void removeItem(item.id)}
                      className="min-h-11 rounded-control border border-line-strong bg-surface px-3.5 text-sm font-semibold text-danger disabled:opacity-50"
                    >
                      {t("patient.cart.remove")}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>

          <section className="flex flex-col gap-1.5 rounded-panel border border-line bg-surface p-4">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-base font-semibold">{t("patient.cart.subtotal")}</span>
              <span className="font-display text-2xl font-normal">
                {formatMoney(locale, cart?.subtotal_poisha ?? 0)}
              </span>
            </div>
            <p className="text-sm text-ink-muted">{t("patient.cart.deliveryNote")}</p>
          </section>
        </div>
      )}
    </TaskScreen>
  );
}
