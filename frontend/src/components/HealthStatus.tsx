"use client";

import type { CommonMessages } from "@/i18n/messages/common";
import { useMessages } from "@/i18n/provider";
import type { Health } from "@/lib/health";

const HEADLINE = {
  ok: "health.ready",
  degraded: "health.degraded",
  unreachable: "health.unreachable",
} as const satisfies Record<Health["state"], keyof CommonMessages>;

const DOT: Record<Health["state"], string> = {
  ok: "bg-primary",
  degraded: "bg-amber",
  unreachable: "bg-danger",
};

const CHECKS = [
  { name: "database", label: "health.database" },
  { name: "redis", label: "health.redis" },
] as const;

export function HealthStatus({ health }: { health: Health }) {
  const { t } = useMessages<CommonMessages>();

  return (
    <section className="rounded-panel border border-line bg-surface p-5">
      <p role="status" className="flex items-center gap-2 font-medium">
        <span
          aria-hidden
          className={`size-2.5 rounded-full ${DOT[health.state]}`}
        />
        {t(HEADLINE[health.state])}
      </p>
      {health.state !== "unreachable" && (
        <ul className="mt-3 space-y-1 text-sm">
          {CHECKS.map(({ name, label }) => {
            const result = health.checks[name];
            return (
              <li key={name} className="flex justify-between gap-6">
                <span>{t(label)}</span>
                <span
                  className={result === "ok" ? "text-primary" : "text-amber"}
                >
                  {t(result === "ok" ? "health.ok" : "health.error")}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
