// Date helpers. Dates are stored as "YYYY-MM-DD" strings and "today" is
// always worked out in UK time, whatever time zone the server runs in.

const TIME_ZONE = "Europe/London";

export function todayISO(now: Date = new Date()): string {
  // The en-CA locale formats dates as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
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
