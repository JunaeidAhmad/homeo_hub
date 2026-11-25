"use client";

import { fill } from "@/i18n/catalog";
import type { AdminMessages } from "@/i18n/messages/admin";
import { useMessages } from "@/i18n/provider";

import { RoleLabel } from "./RoleLabel";
import { useStaffSession } from "./session";

/** Who you are and the roles you hold. Work queues join this page in later tickets. */
export function Overview() {
  const { t } = useMessages<AdminMessages>();
  const session = useStaffSession();
  if (session.status !== "signedIn") return null;
  const { staff } = session;

  return (
    <section className="flex flex-col gap-4">
      <h1 className="font-display text-[34px] leading-tight font-normal desktop:text-[44px]">
        {t("admin.overview.title")}
      </h1>
      <p className="text-base text-ink-soft">
        {fill(t("admin.overview.signedInAs"), { name: staff.full_name })}
      </p>
      {staff.roles.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {staff.roles.map((role) => (
            <li key={role}>
              <RoleLabel role={role} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-ink-muted">{t("admin.overview.noRoles")}</p>
      )}
    </section>
  );
}
