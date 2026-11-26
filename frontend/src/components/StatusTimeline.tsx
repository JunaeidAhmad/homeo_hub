"use client";

import type { Locale } from "@/i18n/config";
import { useMessages } from "@/i18n/provider";

export type TimelineStep = {
  key: string;
  label: string;
  timestamp?: string | null;
};

export type TerminalStop = {
  label: string;
  tone: "danger" | "muted";
  timestamp?: string | null;
};

function formatWhen(locale: Locale, iso: string): string {
  try {
    return new Intl.DateTimeFormat(locale === "bn" ? "bn-BD" : "en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function StatusTimeline({
  steps,
  currentIndex,
  allDone = false,
  terminalStop = null,
}: {
  steps: TimelineStep[];
  currentIndex: number;
  allDone?: boolean;
  terminalStop?: TerminalStop | null;
}) {
  const { locale } = useMessages();
  const isTerminalStop = terminalStop !== null;

  return (
    <ol className="flex flex-col gap-0">
      {steps.map((step, index) => {
        if (isTerminalStop && index >= currentIndex) {
          return null;
        }
        const done = allDone || (isTerminalStop ? index < currentIndex : index < currentIndex);
        const current = !isTerminalStop && index === currentIndex && !allDone;

        return (
          <li key={step.key} className="flex gap-3 pb-4 last:pb-0">
            <div className="flex flex-col items-center pt-1">
              <span
                className={`size-3.5 rounded-full ${
                  done
                    ? "bg-primary"
                    : current
                      ? "border-2 border-primary bg-surface ring-3 ring-primary/20"
                      : "border-2 border-line-strong bg-surface"
                }`}
              />
              {(index < steps.length - 1 && !isTerminalStop) || isTerminalStop ? (
                <span className="mt-1 w-0.5 flex-1 bg-line" />
              ) : null}
            </div>
            <div className="flex min-w-0 flex-col pb-1">
              <span
                className={`text-base ${
                  done || current ? "font-semibold text-ink" : "text-ink-muted"
                }`}
              >
                {step.label}
              </span>
              {step.timestamp && (
                <span className="text-sm text-ink-muted">
                  {formatWhen(locale, step.timestamp)}
                </span>
              )}
            </div>
          </li>
        );
      })}

      {terminalStop && (
        <li className="flex gap-3">
          <div className="flex flex-col items-center pt-1">
            <span
              className={`size-3.5 rounded-full ${
                terminalStop.tone === "danger" ? "bg-danger" : "bg-ink-muted"
              }`}
            />
          </div>
          <div className="flex min-w-0 flex-col">
            <span
              className={`text-base font-semibold ${
                terminalStop.tone === "danger" ? "text-danger" : "text-ink-muted"
              }`}
            >
              {terminalStop.label}
            </span>
            {terminalStop.timestamp && (
              <span className="text-sm text-ink-muted">
                {formatWhen(locale, terminalStop.timestamp)}
              </span>
            )}
          </div>
        </li>
      )}
    </ol>
  );
}
