// English is marked by question type and assessment objective (AO), not right/wrong.

import type { PaperScore, Topic } from "./types";

export interface AoTotal {
  code: string;
  score: number;
  max: number;
  count: number;
}

/** Adds up every AO mark you've logged, so you can see which skill is weakest. */
export function aoTotals(scores: PaperScore[]): AoTotal[] {
  const totals = new Map<string, AoTotal>();
  for (const s of scores) {
    for (const [code, ao] of Object.entries(s.aoScores ?? {})) {
      const t = totals.get(code) ?? { code, score: 0, max: 0, count: 0 };
      t.score += ao.score;
      t.max += ao.max;
      t.count += 1;
      totals.set(code, t);
    }
  }
  return [...totals.values()].sort((a, b) => a.code.localeCompare(b.code));
}

export interface QuestionTypeSummary {
  topic: Topic;
  count: number;
  averagePercent: number | null;
  latest: PaperScore | null;
}

/** Average score for each question type (English Language) or set text (English Literature). */
export function questionTypeSummary(topics: Topic[], scores: PaperScore[]): QuestionTypeSummary[] {
  return topics.map((topic) => {
    const own = scores.filter((s) => s.topicId === topic.id && s.maxScore > 0);
    const average = own.length ? own.reduce((sum, s) => sum + s.score / s.maxScore, 0) / own.length : null;
    return { topic, count: own.length, averagePercent: average, latest: own[0] ?? null };
  });
}
