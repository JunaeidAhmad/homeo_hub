import { toAsciiDigits } from "@/lib/digits";

import type { Locale } from "./config";

/** Numbers in the digits of the page's language (Bangla digits on Bangla pages). */
export function numberFormat(locale: Locale, options?: Intl.NumberFormatOptions) {
  return new Intl.NumberFormat(locale === "bn" ? "bn-BD" : "en-US", options);
}

const DHAKA_TZ = "Asia/Dhaka";

/** Format an ISO timestamp in Asia/Dhaka using the active locale. */
export function formatDateTime(
  locale: Locale,
  iso: string,
  options: Intl.DateTimeFormatOptions = { dateStyle: "medium", timeStyle: "short" },
): string {
  try {
    return new Intl.DateTimeFormat(locale === "bn" ? "bn-BD" : "en-US", {
      timeZone: DHAKA_TZ,
      ...options,
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

/** Format an ISO timestamp's clock time in Asia/Dhaka. */
export function formatTime(
  locale: Locale,
  iso: string,
  options: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit", hour12: true },
): string {
  return formatDateTime(locale, iso, options);
}

/** Format integer poisha as ৳ + amount in the page's digits (no decimals for whole taka). */
export function formatMoney(locale: Locale, poisha: number): string {
  const whole = poisha % 100 === 0;
  const formatted = numberFormat(
    locale,
    whole
      ? { maximumFractionDigits: 0 }
      : { minimumFractionDigits: 2, maximumFractionDigits: 2 },
  ).format(poisha / 100);
  return `৳${formatted}`;
}

/** Parse a taka string (Bangla or ASCII digits, up to 2 decimals) into positive integer poisha. */
export function parseTakaToPoisha(raw: string): number | null {
  const normalized = toAsciiDigits(raw).trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
  const [whole, frac = ""] = normalized.split(".");
  const poisha = Number(whole) * 100 + Number(frac.padEnd(2, "0"));
  if (!Number.isSafeInteger(poisha) || poisha <= 0) return null;
  return poisha;
}

/** Format integer poisha for editing in a taka text input (ASCII digits). */
export function poishaToTakaInput(poisha: number): string {
  if (poisha % 100 === 0) return String(poisha / 100);
  return (poisha / 100).toFixed(2).replace(/0$/, "");
}

/**
 * A remedy's name in the page's language: Bangla on Bangla pages when it has one,
 * the Latin name otherwise. `lang` and `style` go on the element showing it
 * (only Latin names are set in italics).
 */
export function remedyName(locale: Locale, name: string, nameBn?: string) {
  return locale === "bn" && nameBn
    ? { text: nameBn, lang: "bn", style: "" }
    : { text: name, lang: "la", style: "italic" };
}
