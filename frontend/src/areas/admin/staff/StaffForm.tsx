"use client";

import { useEffect, useState, type FormEvent } from "react";

import type { components } from "@/api/schema";
import { FieldError, FormAlert, TextField } from "@/components/form/fields";
import { fill } from "@/i18n/catalog";
import type { AdminMessages } from "@/i18n/messages/admin";
import { useMessages } from "@/i18n/provider";

import { RoleLabel } from "../RoleLabel";
import { useStaffSession } from "../session";
import { useAdminSubmit } from "../use-admin-submit";

export type StaffMember = components["schemas"]["Staff"];
type RoleName = components["schemas"]["RoleEnum"];
type RoleInfo = components["schemas"]["Role"];

/** Create a staff account, or change one (`member`). */
export function StaffForm({
  member,
  onSaved,
  onCancel,
}: {
  member?: StaffMember;
  onSaved: (saved: StaffMember) => void;
  onCancel: () => void;
}) {
  const { t } = useMessages<AdminMessages>();
  const { api } = useStaffSession();
  const { pending, problems, setProblems, submit } = useAdminSubmit();
  const [fullName, setFullName] = useState(member?.full_name ?? "");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [chosen, setChosen] = useState<RoleName[]>(member?.roles ?? []);
  const [active, setActive] = useState(member?.is_active ?? true);
  const [roles, setRoles] = useState<RoleInfo[] | "failed" | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    api
      .GET("/api/v1/admin/roles/", { signal: controller.signal })
      .then(({ data }) => setRoles(data ?? "failed"))
      .catch(() => {
        if (!controller.signal.aborted) setRoles("failed");
      });
    return () => controller.abort();
  }, [api, attempt]);

  const toggle = (role: RoleName) =>
    setChosen((now) => (now.includes(role) ? now.filter((r) => r !== role) : [...now, role]));

  function save(event: FormEvent) {
    event.preventDefault();
    const required = t("admin.error.required");
    const missing: Record<string, string> = {};
    if (!fullName.trim()) missing.full_name = required;
    if (!member && !phone.trim()) missing.phone = required;
    if (!member && !password) missing.password = required;
    if (chosen.length === 0) missing.roles = t("admin.error.roles");
    if (Object.keys(missing).length > 0) {
      setProblems({ fields: missing });
      return;
    }
    const full_name = fullName.trim();
    void submit(
      () =>
        member
          ? api.PATCH("/api/v1/admin/staff/{id}/", {
              params: { path: { id: member.id } },
              body: { full_name, roles: chosen, is_active: active },
            })
          : api.POST("/api/v1/admin/staff/", {
              body: { phone: phone.trim(), full_name, password, roles: chosen },
            }),
      onSaved,
    );
  }

  return (
    <form
      onSubmit={save}
      noValidate
      className="flex max-w-xl flex-col gap-5 rounded-panel border border-line bg-surface p-4 desktop:p-6"
    >
      <h2 className="font-display text-2xl">
        {member
          ? fill(t("admin.staff.editTitle"), { name: member.full_name })
          : t("admin.staff.add")}
      </h2>
      {problems.form && <FormAlert>{problems.form}</FormAlert>}
      <TextField
        label={t("admin.staff.name")}
        error={problems.fields.full_name}
        value={fullName}
        onChange={(event) => setFullName(event.target.value)}
        maxLength={150}
        autoComplete="off"
      />
      {!member && (
        <>
          <TextField
            label={t("admin.phone")}
            prefix="+880"
            error={problems.fields.phone}
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            type="tel"
            autoComplete="off"
          />
          <TextField
            label={t("admin.password")}
            hint={t("admin.staff.passwordHint")}
            error={problems.fields.password}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            type="password"
            autoComplete="new-password"
            maxLength={128}
          />
        </>
      )}

      <fieldset className="flex flex-col gap-1">
        <legend className="mb-1.5 text-[15px] font-semibold">{t("admin.staff.roles")}</legend>
        {roles === null && <p className="text-ink-muted">{t("admin.loading")}</p>}
        {roles === "failed" && (
          <button
            type="button"
            onClick={() => {
              setRoles(null);
              setAttempt((n) => n + 1);
            }}
            className="min-h-11 self-start font-semibold text-primary underline"
          >
            {t("admin.retry")}
          </button>
        )}
        {Array.isArray(roles) &&
          roles.map((role) => (
            <label
              key={role.name}
              className="flex min-h-11 cursor-pointer items-start gap-3 rounded-control px-1 py-2 has-checked:bg-mist"
            >
              <input
                type="checkbox"
                checked={chosen.includes(role.name)}
                onChange={() => toggle(role.name)}
                className="mt-1 size-5 flex-none accent-primary"
              />
              <span className="flex flex-col items-start gap-1">
                <RoleLabel role={role.name} />
                <span className="text-sm text-ink-muted">
                  {role.permissions.map((perm) => t(`admin.perm.${perm}`)).join(", ")}
                </span>
              </span>
            </label>
          ))}
        {problems.fields.roles && <FieldError>{problems.fields.roles}</FieldError>}
      </fieldset>

      {member && (
        <label className="flex cursor-pointer items-start gap-3 px-1">
          <input
            type="checkbox"
            checked={active}
            onChange={(event) => setActive(event.target.checked)}
            className="mt-1 size-5 flex-none accent-primary"
          />
          <span className="flex flex-col">
            <span className="font-semibold">{t("admin.staff.active")}</span>
            <span className="text-sm text-ink-muted">{t("admin.staff.activeHint")}</span>
          </span>
        </label>
      )}

      <div className="flex flex-col gap-2 desktop:flex-row">
        <button
          type="submit"
          disabled={pending}
          className="min-h-13 rounded-control bg-primary px-6 font-bold text-surface disabled:opacity-60"
        >
          {t(member ? "admin.staff.save" : "admin.staff.create")}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="min-h-13 rounded-control border border-line-strong bg-surface px-6 font-semibold"
        >
          {t("admin.staff.cancel")}
        </button>
      </div>
    </form>
  );
}
