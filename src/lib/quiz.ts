// Quote quiz helpers.

import type { Quote } from "./types";

/** Picks a quote at random. Ones you've got wrong before (or never tried) come up more often. */
export function pickQuote(quotes: Quote[], avoidId: number | null): Quote {
  const pool = quotes.length > 1 ? quotes.filter((q) => q.id !== avoidId) : quotes;
  const weights = pool.map((q) => 1 + (q.timesQuizzed - q.timesCorrect) * 2 + (q.timesQuizzed === 0 ? 2 : 0));
  let roll = Math.random() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < pool.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return pool[i];
  }
  return pool[pool.length - 1];
}

/** Chooses about a third of the longer words to hide. Returns their positions. */
export function pickGaps(text: string): number[] {
  const words = text.split(/\s+/);
  const candidates = words.map((w, i) => ({ w, i })).filter(({ w }) => w.replace(/\W/g, "").length >= 4);
  const pool = candidates.length > 0 ? candidates : words.map((w, i) => ({ w, i }));
  const count = Math.max(1, Math.round(pool.length / 3));
  return [...pool]
    .sort(() => Math.random() - 0.5)
    .slice(0, count)
    .map(({ i }) => i);
}
