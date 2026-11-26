"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, type ReactNode } from "react";

import type { components } from "@/api/schema";
import { ActionBar } from "@/areas/patient/ActionBar";
import { useCart } from "@/areas/patient/cart/CartProvider";
import { useSession } from "@/areas/patient/session/SessionProvider";
import { RemedyVial } from "@/components/RemedyVial";
import { formatMoney, remedyName } from "@/i18n/format";
import type { PatientMessages } from "@/i18n/messages/patient";
import { useMessages } from "@/i18n/provider";

import { initialChoice, RemedyChoice, type RemedyChoiceValue } from "./RemedyChoice";

type Remedy = components["schemas"]["RemedyDetail"];

/** Client purchase wrapper for the remedy detail page: pickers, amber/clear vial, and pinned bar. */
export function RemedyPurchase({
  remedy,
  illnessSlug,
  children,
}: {
  remedy: Remedy;
  illnessSlug?: string;
  children: ReactNode;
}) {
  const { locale, t } = useMessages<PatientMessages>();
  const label = remedyName(locale, remedy.name, remedy.name_bn);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const session = useSession();
  const { add } = useCart();

  const requestedPotency = searchParams.get("potency");
  const requestedForm = searchParams.get("form");
  const activeIllness = illnessSlug || searchParams.get("illness") || undefined;

  const [choice, setChoice] = useState<RemedyChoiceValue>(() =>
    initialChoice(remedy.potencies, remedy.prices, requestedPotency, requestedForm),
  );
  const [busy, setBusy] = useState(false);
  const [added, setAdded] = useState(false);
  const [error, setError] = useState("");

  function handleChange(next: RemedyChoiceValue) {
    setChoice(next);
    setAdded(false);
    setError("");
    const params = new URLSearchParams(searchParams.toString());
    params.set("potency", next.potency);
    if (next.form) {
      params.set("form", next.form);
    } else {
      params.delete("form");
    }
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  async function handleAdd() {
    if (!choice.form || choice.price === null) return;
    if (session.status !== "signedIn") {
      const query = searchParams.toString();
      const returnTo = query ? `${pathname}?${query}` : pathname;
      router.push(`/signin?next=${encodeURIComponent(returnTo)}`);
      return;
    }
    setBusy(true);
    setError("");
    const result = await add({
      remedy_id: remedy.id,
      illness_slug: activeIllness ?? null,
      potency: choice.potency,
      form: choice.form,
      quantity: 1,
    });
    setBusy(false);
    if (result.ok) {
      setAdded(true);
    } else {
      setError(t("patient.cart.updateFailed"));
    }
  }

  return (
    <article className="flex flex-col gap-6">
      <div className="-mx-4 -mt-6 flex flex-col bg-surface desktop:mx-0 desktop:mt-0 desktop:flex-row desktop:overflow-hidden desktop:rounded-panel desktop:border desktop:border-line">
        <div className="flex items-center justify-center bg-mist px-4 py-7 desktop:flex-1">
          {remedy.picture_url ? (
            <Image
              unoptimized
              src={remedy.picture_url}
              alt={label.text}
              width={600}
              height={600}
              className="h-auto max-h-96 w-full object-contain"
            />
          ) : (
            <RemedyVial name={label.text} nameLang={label.lang} form={choice.form} />
          )}
        </div>
        <div className="flex flex-col gap-4 px-4 py-6 desktop:flex-1 desktop:p-9">
          <div className="flex flex-col gap-1">
            <h1
              lang={label.lang}
              className={`font-display text-[38px] leading-tight font-normal desktop:text-[52px] ${label.style}`}
            >
              {label.text}
            </h1>
          </div>
          <p className="text-base leading-relaxed whitespace-pre-line text-ink-soft">
            {remedy.indication}
          </p>
          <div className="mt-auto border-t border-line pt-4">
            <RemedyChoice
              potencies={remedy.potencies}
              prices={remedy.prices}
              initialPotency={requestedPotency}
              initialForm={requestedForm}
              onChange={handleChange}
            />
          </div>
        </div>
      </div>

      {children}

      <ActionBar>
        {choice.price !== null && choice.form ? (
          <div className="flex flex-col gap-2">
            {error && (
              <p role="alert" className="text-sm font-medium text-danger">
                {error}
              </p>
            )}
            <p role="status" className="flex items-center justify-between gap-2 text-sm font-semibold text-primary-deep empty:hidden">
              {added && (
                <>
                  <span>{t("patient.cart.added")}</span>
                  <Link href="/cart" className="underline">
                    {t("patient.cart.viewCart")}
                  </Link>
                </>
              )}
            </p>
            <div className="flex items-center justify-between gap-3">
              <div className="flex flex-col">
                <span className="font-display text-2xl leading-none font-normal">
                  {formatMoney(locale, choice.price)}
                </span>
                <span className="text-sm text-ink-muted">
                  {choice.potency} · {t(`patient.remedy.form.${choice.form}`)}
                </span>
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleAdd()}
                className="min-h-[54px] flex-1 rounded-control bg-primary px-5 text-[17px] font-bold text-surface disabled:opacity-60 desktop:max-w-xs"
              >
                {t("patient.remedy.addToCart")}
              </button>
            </div>
          </div>
        ) : (
          <p className="py-2 text-center font-semibold text-ink-muted">
            {t("patient.remedy.unavailable")}
          </p>
        )}
      </ActionBar>
    </article>
  );
}
