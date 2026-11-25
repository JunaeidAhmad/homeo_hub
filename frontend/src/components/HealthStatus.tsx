import type { Health } from "@/lib/health";

const HEADLINE: Record<Health["state"], string> = {
  ok: "API is ready",
  degraded: "API is degraded",
  unreachable: "API is unreachable",
};

const DOT: Record<Health["state"], string> = {
  ok: "bg-[#1E6B4E]",
  degraded: "bg-[#8A4700]",
  unreachable: "bg-red-700",
};

const CHECK_LABELS = { database: "Database", redis: "Redis" } as const;

export function HealthStatus({ health }: { health: Health }) {
  return (
    <section className="rounded-[14px] border border-[#13241D]/15 bg-white p-5">
      <p role="status" className="flex items-center gap-2 font-medium">
        <span aria-hidden className={`size-2.5 rounded-full ${DOT[health.state]}`} />
        {HEADLINE[health.state]}
      </p>
      {health.state !== "unreachable" && (
        <ul className="mt-3 space-y-1 text-sm">
          {(Object.keys(CHECK_LABELS) as (keyof typeof CHECK_LABELS)[]).map((name) => (
            <li key={name} className="flex justify-between gap-6">
              <span>{CHECK_LABELS[name]}</span>
              <span className={health.checks[name] === "ok" ? "text-[#1E6B4E]" : "text-[#8A4700]"}>
                {health.checks[name]}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
