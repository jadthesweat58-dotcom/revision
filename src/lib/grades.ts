// Working grade, confidence and gap-to-target, from logged scores and topic colours.

import { daysBetween } from "./dates";
import type { PaperScore, Status, Subject, Topic } from "./types";

/** How well a topic is known, 0..1, by colour. */
export const MASTERY: Record<Status, number> = { green: 1, amber: 0.6, red: 0.2, unrated: 0.5 };

export type Confidence = "none" | "low" | "medium" | "high";

export interface GradeEstimate {
  /** e.g. 7.4 = working at a 7, 40% of the way to an 8. Null if nothing to go on. */
  grade: number | null;
  /** Recency-weighted average score, 0..1. Null if no scores logged. */
  averagePercent: number | null;
  confidence: Confidence;
  scoreCount: number;
  /** How much topic colours nudged the grade (between -0.3 and +0.3). */
  masteryAdjustment: number;
}

function sortedBoundaries(subject: Subject): { grade: number; percent: number }[] {
  return Object.entries(subject.boundaries)
    .map(([grade, marks]) => ({ grade: Number(grade), percent: marks / subject.boundaryMax }))
    .filter((b) => Number.isFinite(b.grade) && Number.isFinite(b.percent))
    .sort((a, b) => b.grade - a.grade);
}

/** Turns a percentage into a fractional grade using the subject's grade boundaries. */
export function gradeFromPercent(percent: number, subject: Subject): number {
  const bounds = sortedBoundaries(subject);
  if (bounds.length === 0) return 0;
  if (percent >= bounds[0].percent) return bounds[0].grade;
  for (let i = 1; i < bounds.length; i++) {
    const here = bounds[i];
    const above = bounds[i - 1];
    if (percent >= here.percent) {
      return here.grade + (percent - here.percent) / (above.percent - here.percent);
    }
  }
  const lowest = bounds[bounds.length - 1];
  return Math.max(0, lowest.grade - 1 + percent / lowest.percent);
}

/**
 * How much topic colours should nudge the working grade (-0.3 to +0.3).
 * Only rated topics count, and the nudge shrinks when few topics are rated.
 */
export function masteryAdjustment(topics: Topic[]): number {
  const active = topics.filter((t) => !t.archived);
  const rated = active.filter((t) => t.status !== "unrated");
  const totalWeight = active.reduce((sum, t) => sum + t.weight, 0);
  const ratedWeight = rated.reduce((sum, t) => sum + t.weight, 0);
  if (ratedWeight === 0) return 0;
  const mastery = rated.reduce((sum, t) => sum + t.weight * MASTERY[t.status], 0) / ratedWeight;
  const coverage = ratedWeight / totalWeight;
  return Math.max(-0.3, Math.min(0.3, (mastery - 0.6) * 0.75 * coverage));
}

/**
 * Working grade = recent scores (most recent counts most) against the grade
 * boundaries, nudged up or down a little by topic colours.
 */
export function workingGrade(subject: Subject, scores: PaperScore[], topics: Topic[], today: string): GradeEstimate {
  const recent = scores
    .filter((s) => s.subjectId === subject.id && s.maxScore > 0 && daysBetween(s.date, today) <= 365)
    .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id)
    .slice(0, 6);

  const masteryNudge = masteryAdjustment(topics.filter((t) => t.subjectId === subject.id));

  if (recent.length === 0) {
    return { grade: null, averagePercent: null, confidence: "none", scoreCount: 0, masteryAdjustment: masteryNudge };
  }

  let weightedSum = 0;
  let weightTotal = 0;
  recent.forEach((s, i) => {
    const weight = Math.pow(0.8, i);
    weightedSum += (s.score / s.maxScore) * weight;
    weightTotal += weight;
  });
  const averagePercent = weightedSum / weightTotal;

  const topGrade = sortedBoundaries(subject)[0]?.grade ?? 9;
  const grade = Math.max(0, Math.min(topGrade, gradeFromPercent(averagePercent, subject) + masteryNudge));

  return {
    grade,
    averagePercent,
    confidence: confidenceLevel(recent.map((s) => s.score / s.maxScore)),
    scoreCount: recent.length,
    masteryAdjustment: masteryNudge,
  };
}

/** More scores = more confidence; very inconsistent scores knock it down a level. */
export function confidenceLevel(percents: number[]): Confidence {
  const n = percents.length;
  if (n === 0) return "none";
  let level: Confidence = n >= 6 ? "high" : n >= 3 ? "medium" : "low";
  if (n >= 2) {
    const mean = percents.reduce((a, b) => a + b, 0) / n;
    const spread = Math.sqrt(percents.reduce((sum, p) => sum + (p - mean) ** 2, 0) / n);
    if (spread > 0.12) level = level === "high" ? "medium" : "low";
  }
  return level;
}

/**
 * Marks short of (positive) or above (negative) a grade boundary, across the
 * whole qualification. Null if there are no scores or no boundary for that grade.
 */
export function marksToGrade(averagePercent: number | null, grade: number, subject: Subject): number | null {
  const boundary = subject.boundaries[String(grade)];
  if (averagePercent === null || boundary === undefined) return null;
  return Math.ceil(boundary - averagePercent * subject.boundaryMax);
}

export interface GapCloser {
  topic: Topic;
  /** Rough marks available (across the whole qualification) from turning this topic green. */
  marks: number;
}

/** Topics where improving would win the most marks: big topics that aren't green yet. */
export function fastestGapClosers(subject: Subject, topics: Topic[], count = 3): GapCloser[] {
  const active = topics.filter((t) => t.subjectId === subject.id && !t.archived);
  const totalWeight = active.reduce((sum, t) => sum + t.weight, 0) || 1;
  return active
    .map((topic) => ({
      topic,
      marks: (topic.weight / totalWeight) * subject.boundaryMax * (1 - MASTERY[topic.status]),
    }))
    .filter((c) => c.marks > 0)
    .sort((a, b) => b.marks - a.marks)
    .slice(0, count);
}

/** Mark scheme level for a single answer (most English questions use 5 levels). */
export function markSchemeLevel(score: number, max: number, levels = 5): number {
  if (max <= 0 || score <= 0) return 0;
  return Math.min(levels, Math.max(1, Math.ceil((score / max) * levels)));
}

export function formatGrade(grade: number | null): string {
  if (grade === null) return "–";
  return grade.toFixed(1);
}
