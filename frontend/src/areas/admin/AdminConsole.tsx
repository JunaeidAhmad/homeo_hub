"use client";

import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import { FormAlert } from "@/components/form/fields";
import { Bell } from "@/components/notifications/Bell";
import { SideNavShell } from "@/components/shell/SideNavShell";
import type { AdminMessages } from "@/i18n/messages/admin";
import { useMessages } from "@/i18n/provider";

import { mayOpen, visibleSections } from "./nav";
import { useStaffSession, type StaffAccount } from "./session";

const BUTTON =
  "flex min-h-11 items-center justify-center rounded-control border border-line-strong bg-surface px-4 font-semibold disabled:opacity-60";

function AccountFooter({ staff }: { staff: StaffAccount }) {
  const { t } = useMessages<AdminMessages>();
  const { signOut } = useStaffSession();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function leave() {
    setBusy(true);
    setFailed(!(await signOut()));
    setBusy(false);
  }

  return (
    <div className="mt-3 flex flex-col gap-2 border-t border-line pt-3">
      <p className="truncate px-1 text-[15px] font-semibold">{staff.full_name}</p>
      {failed && <FormAlert>{t("admin.signout.failed")}</FormAlert>}
      <button type="button" onClick={() => void leave()} disabled={busy} className={BUTTON}>
        {t("admin.signout")}
      </button>
    </div>
  );
}

/**
 * The signed-in admin: nothing is shown until we know who it is, the navigation lists
 * only what their roles open, and signing out removes every page's data.
 */
export function AdminConsole({ children }: { children: ReactNode }) {
  const { t } = useMessages<AdminMessages>();
  const session = useStaffSession();
  const pathname = usePathname();
  const router = useRouter();

  const signedOut =
    session.status === "signedOut" || (session.status === "unavailable" && !session.hasSession);
  useEffect(() => {
    if (session.status === "signedOut") router.replace("/admin/signin");
  }, [session.status, router]);

  if (session.status !== "signedIn") {
    return (
      <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-3 px-4">
        {session.status === "unavailable" ? (
          <>
            <FormAlert>{t("admin.unavailable")}</FormAlert>
            <button type="button" onClick={session.retry} className={BUTTON}>
              {t("admin.retry")}
            </button>
            {signedOut && (
              <button type="button" onClick={() => router.replace("/admin/signin")} className={BUTTON}>
                {t("admin.signin")}
              </button>
            )}
          </>
        ) : (
          <p role="status" className="text-center text-ink-muted">
            {t("admin.loading")}
          </p>
        )}
      </main>
    );
  }

  const { staff } = session;
  return (
    <SideNavShell
      areaName={t("admin.area")}
      items={visibleSections(staff.permissions).map(({ href, label }) => ({
        href,
        label: t(label),
      }))}
      headerActions={
        <Bell
          api={session.api}
          unreadPath="/api/v1/admin/notifications/unread-count/"
          href="/admin/notifications"
        />
      }
      footer={<AccountFooter staff={staff} />}
    >
      {/* Keyed by person, so one staff member's page state never shows to the next. */}
      <div key={staff.id}>
        {mayOpen(staff.permissions, pathname) ? children : <FormAlert>{t("admin.noAccess")}</FormAlert>}
      </div>
    </SideNavShell>
  );
}
