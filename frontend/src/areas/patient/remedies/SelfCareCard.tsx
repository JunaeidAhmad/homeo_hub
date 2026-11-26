"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import type { components } from "@/api/schema";
import { useCart } from "@/areas/patient/cart/CartProvider";
import { useSession } from "@/areas/patient/session/SessionProvider";
import { RemedyVial } from "@/components/RemedyVial";
import { remedyName } from "@/i18n/format";
import type { PatientMessages } from "@/i18n/messages/patient";
import { useMessages } from "@/i18n/provider";

import {
  DEFAULT_POTENCIES,
  initialChoice,
  RemedyChoice,
  type RemedyChoiceValue,
} from "./RemedyChoice";

type RankedRemedy = components["schemas"]["RankedRemedyCard"];

/** Ranked remedy card on the self-care page: picture/vial, pickers, price, and Add to cart. */
export function SelfCareCard({
  remedy,
  illnessSlug,
  illnessId,
}: {
  remedy: RankedRemedy;
  illnessSlug: string;
  illnessId?: string;
}) {
  const { locale, t } = useMessages<PatientMessages>();
  const label = remedyName(locale, remedy.name, remedy.name_bn);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const session = useSession();
  const { add } = useCart();

  const [choice, setChoice] = useState<RemedyChoiceValue>(() =>
    initialChoice(DEFAULT_POTENCIES, remedy.prices),
  );
  const [busy, setBusy] = useState(false);
  const [added, setAdded] = useState(false);
  const [error, setError] = useState("");

  const query = new URLSearchParams({ illness: illnessSlug, potency: choice.potency });
  if (choice.form) query.set("form", choice.form);
  const href = `/remedies/${remedy.slug}?${query.toString()}`;

  async function handleAdd() {
    if (!choice.form || choice.price === null) return;
    if (session.status !== "signedIn") {
      const qs = searchParams.toString();
      const returnTo = qs ? `${pathname}?${qs}` : pathname;
      router.push(`/signin?next=${encodeURIComponent(returnTo)}`);
      return;
    }
    setBusy(true);
    setError("");
    const result = await add({
      remedy_id: remedy.id,
      illness_id: illnessId ?? null,
      illness_slug: illnessId ? null : illnessSlug,
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
    <article className="flex flex-col gap-3.5 rounded-panel border border-line bg-surface p-4">
      <div className="flex gap-3.5">
        <Link
          href={href}
          className="flex h-24 w-18 flex-none items-center justify-center overflow-hidden rounded-control bg-mist"
        >
          {remedy.picture_url ? (
            <Image
              unoptimized
              src={remedy.picture_url}
              alt=""
              width={72}
              height={96}
              className="size-full object-contain"
            />
          ) : (
            <RemedyVial name={label.text} size="small" form={choice.form} />
          )}
        </Link>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <Link href={href} className="hover:underline">
            <span
              lang={label.lang}
              className={`font-display text-xl leading-tight ${label.style}`}
            >
              {label.text}
            </span>
          </Link>
          <p className="mt-1 line-clamp-2 text-[15px] leading-snug text-ink-soft">
            {remedy.indication}
          </p>
        </div>
      </div>

      <div className="border-t border-line pt-3">
        <RemedyChoice
          prices={remedy.prices}
          compact
          onChange={(next) => {
            setChoice(next);
            setAdded(false);
            setError("");
          }}
        />
      </div>

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

      <button
        type="button"
        disabled={busy || choice.price === null}
        onClick={() => void handleAdd()}
        className="mt-auto min-h-13 w-full rounded-control bg-primary px-5 font-bold text-surface disabled:cursor-not-allowed disabled:opacity-60"
      >
        {choice.price !== null ? t("patient.remedy.addToCart") : t("patient.remedy.unavailable")}
      </button>
    </article>
  );
}
