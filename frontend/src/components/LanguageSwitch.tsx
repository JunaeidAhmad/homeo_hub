"use client";

import type { Locale } from "@/i18n/config";
import type { CommonMessages } from "@/i18n/messages/common";
import { useMessages } from "@/i18n/provider";
import { rememberLanguage } from "@/i18n/remember";

// Each language is named in its own script, whichever language the page is in.
const OPTIONS: { locale: Locale; label: string; name: string }[] = [
  { locale: "en", label: "EN", name: "English" }, // "EN" alone would be spelled out by a screen reader
  { locale: "bn", label: "বাংলা", name: "বাংলা" },
];

/** Switch between English and Bangla; the choice is remembered in a cookie. */
export function LanguageSwitch({
  reload = () => window.location.reload(),
}: {
  /** Reloads the page so the server renders it in the new language. */
  reload?: () => void;
}) {
  const { locale, t } = useMessages<CommonMessages>();

  function choose(next: Locale) {
    if (next === locale) return;
    rememberLanguage(next);
    reload();
  }

  return (
    <div
      role="group"
      aria-label={t("lang.label")}
      className="flex overflow-hidden rounded-control border border-line-strong"
    >
      {OPTIONS.map(({ locale: option, label, name }) => {
        const on = option === locale;
        return (
          <button
            key={option}
            type="button"
            lang={option}
            aria-label={name}
            aria-pressed={on}
            onClick={() => choose(option)}
            className={`min-h-11 min-w-12 px-3 text-[15px] font-semibold ${
              on ? "bg-ink text-surface" : "bg-surface text-ink-soft"
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
