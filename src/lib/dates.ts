// Date helpers. Dates are stored as "YYYY-MM-DD" strings and "today" is worked
// out in your time zone (set in Settings), whatever time zone the server runs in.

export const DEFAULT_TIME_ZONE = "Europe/London";

/** Time zones offered in Settings. */
export const TIME_ZONES = [
  { id: "Asia/Dubai", label: "UAE (Dubai, Abu Dhabi)" },
  { id: "Asia/Muscat", label: "Oman" },
  { id: "Asia/Qatar", label: "Qatar" },
  { id: "Asia/Bahrain", label: "Bahrain" },
  { id: "Asia/Kuwait", label: "Kuwait" },
  { id: "Asia/Riyadh", label: "Saudi Arabia" },
  { id: "Asia/Baghdad", label: "Iraq" },
  { id: "Asia/Amman", label: "Jordan" },
  { id: "Asia/Beirut", label: "Lebanon" },
  { id: "Africa/Cairo", label: "Egypt" },
  { id: "Europe/Istanbul", label: "Turkey" },
  { id: "Europe/London", label: "UK" },
];

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone });
    return true;
  } catch {
    return false;
  }
}

export function todayISO(now: Date = new Date(), timeZone: string = DEFAULT_TIME_ZONE): string {
  // The en-CA locale formats dates as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: isValidTimeZone(timeZone) ? timeZone : DEFAULT_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function toUTC(iso: string): Date {
  return new Date(iso + "T00:00:00Z");
}

export function addDays(iso: string, days: number): string {
  const d = toUTC(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Whole days from `from` to `to` (positive when `to` is later). */
export function daysBetween(from: string, to: string): number {
  return Math.round((toUTC(to).getTime() - toUTC(from).getTime()) / 86_400_000);
}

/** 0 = Monday ... 6 = Sunday */
export function dayOfWeek(iso: string): number {
  return (toUTC(iso).getUTCDay() + 6) % 7;
}

/** The Monday of the week containing `iso`. */
export function weekStart(iso: string): string {
  return addDays(iso, -dayOfWeek(iso));
}

export function formatDate(iso: string, style: "short" | "long" = "short"): string {
  return toUTC(iso).toLocaleDateString("en-GB", {
    timeZone: "UTC",
    weekday: style === "long" ? "long" : "short",
    day: "numeric",
    month: style === "long" ? "long" : "short",
  });
}

/** "today", "tomorrow", "in 5 days", "yesterday", "3 days ago" */
export function relativeDays(days: number): string {
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days === -1) return "yesterday";
  return days > 0 ? `in ${days} days` : `${-days} days ago`;
}
