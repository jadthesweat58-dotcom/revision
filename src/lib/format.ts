export function formatMinutes(minutes: number): string {
  const m = Math.round(minutes);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${h} h ${rest} min` : `${h} h`;
}

export function formatHours(minutes: number): string {
  const h = minutes / 60;
  return `${Number.isInteger(h) ? h : h.toFixed(1)} h`;
}

export function percent(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}

/** "1 mark", "3 marks" */
export function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

export const KIND_LABEL: Record<string, string> = { mock: "Mock", final: "Exam", test: "Test" };
