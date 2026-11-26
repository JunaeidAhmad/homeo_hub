"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import { DisclaimerFooter } from "@/components/DisclaimerFooter";
import { FormAlert } from "@/components/form/fields";
import { Bell } from "@/components/notifications/Bell";
import { SideNavShell } from "@/components/shell/SideNavShell";
import type { DoctorMessages } from "@/i18n/messages/doctor";
import { useMessages } from "@/i18n/provider";

import { DOCTOR_NAV } from "./nav";
import { useDoctorSession, type DoctorAccount } from "./session";

const BUTTON =
  "flex min-h-11 items-center justify-center rounded-control border border-line-strong bg-surface px-4 font-semibold disabled:opacity-60";

function AccountFooter({ doctor }: { doctor: DoctorAccount }) {
  const { t } = useMessages<DoctorMessages>();
  const { signOut } = useDoctorSession();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function leave() {
    setBusy(true);
    setFailed(!(await signOut()));
    setBusy(false);
  }

  return (
    <div className="mt-3 flex flex-col gap-2 border-t border-line pt-3">
      <div className="px-1">
        <p className="truncate text-[15px] font-semibold">{doctor.full_name}</p>
        {doctor.doctor_code && (
          <p className="text-xs font-semibold tracking-wide text-primary">
            {doctor.doctor_code}
          </p>
        )}
      </div>
      {failed && <FormAlert>{t("doctor.signout.failed")}</FormAlert>}
      <button type="button" onClick={() => void leave()} disabled={busy} className={BUTTON}>
        {t("doctor.signout")}
      </button>
    </div>
  );
}

/**
 * The signed-in doctor portal: unauthenticated doctors go to sign-in, and
 * non-approved doctors see only their application page until approved.
 */
export function DoctorConsole({ children }: { children: ReactNode }) {
  const { t } = useMessages<DoctorMessages>();
  const session = useDoctorSession();
  const pathname = usePathname();
  const router = useRouter();

  const signedOut =
    session.status === "signedOut" || (session.status === "unavailable" && !session.hasSession);

  useEffect(() => {
    if (session.status === "signedOut") router.replace("/doctor/signin");
  }, [session.status, router]);

  const notApproved =
    session.status === "signedIn" && session.doctor.status !== "APPROVED";
  const onApplication = pathname.startsWith("/doctor/application");

  useEffect(() => {
    if (notApproved && !onApplication) {
      router.replace("/doctor/application");
    }
  }, [notApproved, onApplication, router]);

  if (session.status !== "signedIn") {
    return (
      <div className="flex min-h-dvh flex-col">
        <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-3 px-4">
          {session.status === "unavailable" ? (
            <>
              <FormAlert>{t("doctor.unavailable")}</FormAlert>
              <button type="button" onClick={session.retry} className={BUTTON}>
                {t("doctor.retry")}
              </button>
              {signedOut && (
                <button
                  type="button"
                  onClick={() => router.replace("/doctor/signin")}
                  className={BUTTON}
                >
                  {t("doctor.signin")}
                </button>
              )}
            </>
          ) : (
            <p role="status" className="text-center text-ink-muted">
              {t("doctor.loading")}
            </p>
          )}
        </main>
        <DisclaimerFooter />
      </div>
    );
  }

  const { doctor } = session;
  const navItems =
    doctor.status === "APPROVED"
      ? DOCTOR_NAV.map(({ href, label }) => ({ href, label: t(label) }))
      : [{ href: "/doctor/application", label: t("doctor.nav.application") }];

  return (
    <SideNavShell
      areaName={t("doctor.area")}
      items={navItems}
      headerActions={
        <Bell
          api={session.api}
          unreadPath="/api/v1/doctor/notifications/unread-count/"
          href="/doctor/notifications"
        />
      }
      footer={<AccountFooter doctor={doctor} />}
    >
      <div key={doctor.id}>
        {notApproved && !onApplication ? (
          <p role="status" className="text-ink-muted">
            {t("doctor.loading")}
          </p>
        ) : (
          children
        )}
      </div>
    </SideNavShell>
  );
}
