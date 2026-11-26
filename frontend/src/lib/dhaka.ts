const DHAKA_TZ = "Asia/Dhaka";

/** Return "YYYY-MM-DD" in Asia/Dhaka for an ISO timestamp or Date. */
export function dhakaDateValue(input: string | Date): string {
  const date = typeof input === "string" ? new Date(input) : input;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: DHAKA_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** Return "HH:mm" (24h) in Asia/Dhaka for an ISO timestamp or Date. */
export function dhakaTimeValue(input: string | Date): string {
  const date = typeof input === "string" ? new Date(input) : input;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: DHAKA_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const hourRaw = parts.find((p) => p.type === "hour")?.value ?? "09";
  const hour = hourRaw === "24" ? "00" : hourRaw;
  const minute = parts.find((p) => p.type === "minute")?.value ?? "00";
  return `${hour}:${minute}`;
}

/** Combine a Dhaka calendar date ("YYYY-MM-DD") and time ("HH:mm") into a UTC ISO string. */
export function dhakaInputToIso(dateStr: string, timeStr: string): string {
  return new Date(`${dateStr}T${timeStr}:00+06:00`).toISOString();
}

/** Shift a "YYYY-MM-DD" date string by `days` calendar days cleanly in UTC/Dhaka. */
export function shiftDhakaDate(dateStr: string, days: number): string {
  const dt = new Date(`${dateStr}T12:00:00Z`);
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

/** Start of week (Sunday or Monday; uses Saturday in Bangladesh clinic week or Monday: Mon). */
export function weekStartMonday(dateStr: string): string {
  const dt = new Date(`${dateStr}T12:00:00Z`);
  const day = dt.getUTCDay(); // 0 Sun..6 Sat
  const diff = day === 0 ? -6 : 1 - day;
  dt.setUTCDate(dt.getUTCDate() + diff);
  return dt.toISOString().slice(0, 10);
}
