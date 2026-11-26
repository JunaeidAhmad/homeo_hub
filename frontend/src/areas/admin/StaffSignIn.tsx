"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

import type { components } from "@/api/schema";
import { CodeField, isCompleteCode } from "@/components/auth/CodeField";
import { FormAlert, Heading, SubmitBar, TextField } from "@/components/form/fields";
import { LanguageSwitch } from "@/components/LanguageSwitch";
import { Logo } from "@/components/Logo";
import { useForgetOnLeave } from "@/hooks/use-forget-on-leave";
import type { AdminMessages } from "@/i18n/messages/admin";
import { useMessages } from "@/i18n/provider";
import { WEB_CLIENT } from "@/lib/session/auth-session";

import { useStaffSession } from "./session";
import { useAdminSubmit } from "./use-admin-submit";

type StaffSessionPayload = Pick<
  components["schemas"]["Session"],
  "access_token" | "expires_in" | "user_type"
>;

type Stage =
  | { kind: "password" }
  | { kind: "setup"; challengeId: string; secret: string; qrSvg: string }
  | { kind: "code"; challengeId: string; useRecovery: boolean }
  | {
      kind: "recovery";
      codes: string[];
      session: StaffSessionPayload;
    };

function formatSecret(secret: string): string {
  return secret.replace(/(.{4})/g, "$1 ").trim();
}

export function StaffSignIn() {
  const { t } = useMessages<AdminMessages>();
  const session = useStaffSession();
  const router = useRouter();
  const { pending, problems, setProblems, submit } = useAdminSubmit();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [stage, setStage] = useState<Stage>({ kind: "password" });
  const [code, setCode] = useState("");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [savedAck, setSavedAck] = useState(false);
  const [copiedNotice, setCopiedNotice] = useState("");

  useForgetOnLeave(() => {
    setPassword("");
    setCode("");
    setRecoveryCode("");
    setStage({ kind: "password" });
  });

  const signedIn =
    session.status === "signedIn" || (session.status === "unavailable" && session.hasSession);
  useEffect(() => {
    if (signedIn) router.replace("/admin");
  }, [signedIn, router]);

  async function copyText(text: string, labelKey: keyof AdminMessages) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedNotice(t(labelKey));
    } catch {
      setCopiedNotice("");
    }
  }

  function downloadRecoveryCodes(codes: string[]) {
    const content = `${codes.join("\n")}\n`;
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "homeohub-recovery-codes.txt";
    link.click();
    URL.revokeObjectURL(url);
  }

  function loadSetup(challengeId: string) {
    void submit(
      () =>
        session.publicApi.POST("/api/v1/auth/staff/totp/setup/", {
          ...WEB_CLIENT,
          body: { challenge_id: challengeId },
        }),
      (setupData) => {
        setCode("");
        setCopiedNotice("");
        setStage({
          kind: "setup",
          challengeId,
          secret: setupData.secret,
          qrSvg: setupData.qr_svg,
        });
      },
    );
  }

  function signIn(event: FormEvent) {
    event.preventDefault();
    const required = t("admin.error.required");
    if (!username.trim() || !password) {
      setProblems({
        fields: {
          ...(!username.trim() && { username: required }),
          ...(!password && { password: required }),
        },
      });
      return;
    }
    void submit(
      () =>
        session.publicApi.POST("/api/v1/auth/staff/login/", {
          ...WEB_CLIENT,
          body: { username: username.trim(), password },
        }),
      async (opened) => {
        if ("challenge_id" in opened) {
          setUsername("");
          setPassword("");
          if (opened.setup_required) {
            loadSetup(opened.challenge_id);
          } else {
            setCode("");
            setRecoveryCode("");
            setStage({ kind: "code", challengeId: opened.challenge_id, useRecovery: false });
          }
          return;
        }
        await session.completeSignIn(opened);
        setUsername("");
        setPassword("");
      },
    );
  }

  function verifyTotp(event: FormEvent) {
    event.preventDefault();
    if (stage.kind !== "setup" && stage.kind !== "code") return;

    const usingRecovery = stage.kind === "code" && stage.useRecovery;
    if (usingRecovery && !recoveryCode.trim()) {
      setProblems({ fields: { recovery_code: t("admin.totp.recoveryRequired") } });
      return;
    }
    if (!usingRecovery && !isCompleteCode(code)) {
      setProblems({ fields: { code: t("admin.totp.codeRequired") } });
      return;
    }

    const challengeId = stage.challengeId;
    void submit(
      () =>
        session.publicApi.POST("/api/v1/auth/staff/totp/verify/", {
          ...WEB_CLIENT,
          body: {
            challenge_id: challengeId,
            code: usingRecovery ? "" : code,
            recovery_code: usingRecovery ? recoveryCode.trim() : "",
          },
        }),
      async (verified) => {
        setCode("");
        setRecoveryCode("");
        const openedSession: StaffSessionPayload = {
          access_token: verified.access_token,
          expires_in: verified.expires_in,
          user_type: verified.user_type as StaffSessionPayload["user_type"],
        };
        if (verified.recovery_codes && verified.recovery_codes.length > 0) {
          setSavedAck(false);
          setCopiedNotice("");
          setStage({ kind: "recovery", codes: verified.recovery_codes, session: openedSession });
          return;
        }
        await session.completeSignIn(openedSession);
      },
    );
  }

  async function finishSetup(event: FormEvent) {
    event.preventDefault();
    if (stage.kind !== "recovery") return;
    if (!savedAck) {
      setProblems({ form: t("admin.totp.savedAckRequired"), fields: {} });
      return;
    }
    await session.completeSignIn(stage.session);
  }

  function resetToPassword() {
    setProblems({ fields: {} });
    setCode("");
    setRecoveryCode("");
    setCopiedNotice("");
    setStage({ kind: "password" });
  }

  return (
    <div className="flex min-h-dvh flex-col bg-surface">
      <header className="flex min-h-14 items-center justify-between gap-2 border-b border-line pr-2 pl-4">
        <Logo />
        <LanguageSwitch />
      </header>
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 pt-6 desktop:pt-16">
        {stage.kind === "password" && (
          <form onSubmit={signIn} noValidate className="flex flex-1 flex-col gap-5 desktop:flex-none">
            <Heading title={t("admin.signin.title")} />
            {problems.form && <FormAlert>{problems.form}</FormAlert>}
            <TextField
              label={t("admin.username")}
              error={problems.fields.username}
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              maxLength={150}
            />
            <TextField
              label={t("admin.password")}
              error={problems.fields.password}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              autoComplete="current-password"
              maxLength={128}
            />
            <SubmitBar pending={pending}>{t("admin.signin")}</SubmitBar>
          </form>
        )}

        {stage.kind === "setup" && (
          <form
            onSubmit={verifyTotp}
            noValidate
            className="flex flex-1 flex-col gap-5 pb-8 desktop:flex-none"
          >
            <Heading title={t("admin.totp.setupTitle")} note={t("admin.totp.setupIntro")} />
            {problems.form && <FormAlert>{problems.form}</FormAlert>}

            <div className="flex flex-col items-center gap-3 rounded-panel border border-line bg-surface p-5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`data:image/svg+xml;utf8,${encodeURIComponent(stage.qrSvg)}`}
                width={200}
                height={200}
                alt={t("admin.totp.qrAlt")}
              />
              <div className="flex w-full flex-col gap-1.5 border-t border-line pt-3">
                <span className="text-xs font-semibold text-ink-muted">
                  {t("admin.totp.manualKeyLabel")}
                </span>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <code className="font-mono text-sm font-semibold tracking-wider text-ink">
                    {formatSecret(stage.secret)}
                  </code>
                  <button
                    type="button"
                    onClick={() => void copyText(stage.secret, "admin.totp.copiedKey")}
                    className="min-h-10 rounded-control border border-line-strong bg-surface px-3 text-sm font-semibold"
                  >
                    {t("admin.totp.copyKey")}
                  </button>
                </div>
                {copiedNotice && <p className="text-xs text-primary-deep">{copiedNotice}</p>}
              </div>
            </div>

            <CodeField
              label={t("admin.totp.codeLabel")}
              value={code}
              onChange={setCode}
              error={problems.fields.code}
            />

            <SubmitBar pending={pending}>{t("admin.totp.confirmSetup")}</SubmitBar>
            <button
              type="button"
              onClick={resetToPassword}
              className="self-start text-sm font-semibold text-ink-muted underline"
            >
              {t("admin.totp.backToSignIn")}
            </button>
          </form>
        )}

        {stage.kind === "code" && (
          <form
            onSubmit={verifyTotp}
            noValidate
            className="flex flex-1 flex-col gap-5 desktop:flex-none"
          >
            <Heading title={t("admin.totp.verifyTitle")} note={t("admin.totp.verifyIntro")} />
            {problems.form && <FormAlert>{problems.form}</FormAlert>}

            {stage.useRecovery ? (
              <TextField
                label={t("admin.totp.recoveryLabel")}
                error={problems.fields.recovery_code}
                value={recoveryCode}
                onChange={(event) => setRecoveryCode(event.target.value)}
                autoCapitalize="none"
                spellCheck={false}
                maxLength={32}
              />
            ) : (
              <CodeField
                label={t("admin.totp.codeLabel")}
                value={code}
                onChange={setCode}
                error={problems.fields.code}
              />
            )}

            <button
              type="button"
              onClick={() => {
                setProblems({ fields: {} });
                setStage({ ...stage, useRecovery: !stage.useRecovery });
              }}
              className="self-start text-sm font-semibold text-primary-deep underline"
            >
              {t(stage.useRecovery ? "admin.totp.useAppCode" : "admin.totp.useRecovery")}
            </button>

            <SubmitBar pending={pending}>{t("admin.totp.verifyBtn")}</SubmitBar>
            <button
              type="button"
              onClick={resetToPassword}
              className="self-start text-sm font-semibold text-ink-muted underline"
            >
              {t("admin.totp.backToSignIn")}
            </button>
          </form>
        )}

        {stage.kind === "recovery" && (
          <form
            onSubmit={(event) => void finishSetup(event)}
            noValidate
            className="flex flex-1 flex-col gap-5 pb-8 desktop:flex-none"
          >
            <Heading title={t("admin.totp.recoveryTitle")} note={t("admin.totp.recoveryBody")} />
            {problems.form && <FormAlert>{problems.form}</FormAlert>}

            <div className="grid grid-cols-2 gap-2 rounded-panel border border-line bg-mist p-4">
              {stage.codes.map((item) => (
                <code
                  key={item}
                  className="rounded-control border border-line bg-surface px-3 py-2 text-center font-mono text-sm font-semibold text-ink"
                >
                  {item}
                </code>
              ))}
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() =>
                  void copyText(stage.codes.join("\n"), "admin.totp.copiedCodes")
                }
                className="min-h-11 rounded-control border border-line-strong bg-surface px-4 text-sm font-semibold"
              >
                {t("admin.totp.copyCodes")}
              </button>
              <button
                type="button"
                onClick={() => downloadRecoveryCodes(stage.codes)}
                className="min-h-11 rounded-control border border-line-strong bg-surface px-4 text-sm font-semibold"
              >
                {t("admin.totp.downloadCodes")}
              </button>
            </div>
            {copiedNotice && <p className="text-sm text-primary-deep">{copiedNotice}</p>}

            <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-control border border-line bg-surface px-3.5 py-2.5 text-sm font-medium text-ink">
              <input
                type="checkbox"
                checked={savedAck}
                onChange={(event) => {
                  setSavedAck(event.target.checked);
                  if (event.target.checked) setProblems({ fields: {} });
                }}
                className="size-5 accent-primary"
              />
              <span>{t("admin.totp.savedAck")}</span>
            </label>

            <SubmitBar pending={pending}>{t("admin.totp.continue")}</SubmitBar>
          </form>
        )}
      </main>
    </div>
  );
}
