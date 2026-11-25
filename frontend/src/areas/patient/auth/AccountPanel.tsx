"use client";

import Link from "next/link";
import { useState } from "react";

import { useSession } from "@/areas/patient/session/SessionProvider";
import { numberFormat } from "@/i18n/format";
import type { AuthMessages } from "@/i18n/messages/auth";
import { useMessages } from "@/i18n/provider";

import { FormAlert } from "./fields";

const PRIMARY =
  "flex min-h-[54px] items-center justify-center rounded-control bg-primary px-5 text-[17px] font-bold text-surface";
const SECONDARY =
  "flex min-h-[54px] items-center justify-center rounded-control border border-line-strong bg-surface px-5 text-[17px] font-semibold";

/** Who is signed in, and sign-out. The rest of the profile arrives in ticket 15. */
export function AccountPanel() {
  const { t, locale } = useMessages<AuthMessages>();
  const session = useSession();
  const [signingOut, setSigningOut] = useState(false);
  const [failed, setFailed] = useState(false);

  if (session.status === "loading") {
    return (
      <p role="status" className="text-ink-muted">
        {t("auth.loading")}
      </p>
    );
  }

  if (session.status === "unavailable") {
    return (
      <div className="flex flex-col gap-3">
        <FormAlert>{t("auth.account.unavailable")}</FormAlert>
        <button type="button" onClick={session.retry} className={PRIMARY}>
          {t("auth.account.retry")}
        </button>
        {!session.hasSession && (
          <Link href="/signin" className={SECONDARY}>
            {t("auth.signin")}
          </Link>
        )}
      </div>
    );
  }

  if (session.status === "signedOut") {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-base text-ink-muted">{t("auth.account.signedOut")}</p>
        <Link href="/signin" className={PRIMARY}>
          {t("auth.signin")}
        </Link>
        <Link href="/signup" className={SECONDARY}>
          {t("auth.create")}
        </Link>
      </div>
    );
  }

  const { patient } = session;
  const details = [
    [t("auth.name"), patient.full_name],
    [t("auth.phone"), patient.phone],
    [t("auth.age"), numberFormat(locale).format(patient.age)],
    [t("auth.account.area"), patient.location.display_name],
  ];

  async function signOut() {
    setSigningOut(true);
    setFailed(!(await session.signOut()));
    setSigningOut(false);
  }

  return (
    <div className="flex flex-col gap-4">
      <dl className="divide-y divide-line rounded-panel border border-line bg-surface">
        {details.map(([label, value]) => (
          <div key={label} className="flex flex-col gap-0.5 px-4 py-3">
            <dt className="text-sm font-semibold text-ink-muted">{label}</dt>
            <dd className="text-[17px]">{value}</dd>
          </div>
        ))}
      </dl>
      {failed && <FormAlert>{t("auth.account.signOutFailed")}</FormAlert>}
      <button type="button" onClick={() => void signOut()} disabled={signingOut} className={SECONDARY}>
        {t("auth.account.signOut")}
      </button>
    </div>
  );
}
