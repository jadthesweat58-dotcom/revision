// The revision "brain": spaced repetition, priority scores and weekly hours.
// Everything here is a plain function of the data, so it is easy to test.

import { addDays, daysBetween } from "./dates";
import type { Assessment, AssessmentKind, Settings, Status, Subject, Topic } from "./types";

// ---------- Spaced repetition ----------

/**
 * When a topic should come back for review after being rated.
 * Red: 2 days. Amber: 5 days. Green: 14 days, or 21 days if it was already
 * green last time (a "cold retest" to check it has really stuck).
 */
export function nextReviewDate(newStatus: Status, previousStatus: Status, today: string): string {
  if (newStatus === "red") return addDays(today, 2);
  if (newStatus === "amber") return addDays(today, 5);
  if (newStatus === "green") return addDays(today, previousStatus === "green" ? 21 : 14);
  return today;
}

/** Topics that are due (or overdue) get pushed up; topics not due yet are held back. */
export function reviewFactor(nextReview: string | null, today: string): number {
  if (!nextReview) return 1;
  const overdueBy = daysBetween(nextReview, today);
  if (overdueBy < 0) return 0.3;
  return 1 + Math.min(overdueBy, 14) / 28; // up to 1.5x when two weeks overdue
}

// ---------- Priority ----------

export const WEAKNESS: Record<Status, number> = { red: 1, amber: 0.6, green: 0.25, unrated: 0.8 };

/** Rises steeply as an exam gets close: ~0.66 at 8 months, ~1.5 at 5 weeks, ~3.3 at 1 week. */
export function urgency(daysToExam: number | null): number {
  if (daysToExam === null) return 0.5;
  return 0.5 + 40 / (Math.max(daysToExam, 0) + 5);
}

/** The next mock or final exam for a subject (class tests are handled separately). */
export function nextExam(subjectId: number, assessments: Assessment[], today: string): Assessment | null {
  return (
    assessments
      .filter((a) => a.subjectId === subjectId && a.kind !== "test" && a.date >= today)
      .sort((a, b) => a.date.localeCompare(b.date))[0] ?? null
  );
}

/**
 * Class tests in the next 3 weeks boost the topics they cover, more as the
 * test gets closer. A test with no topics listed gives the whole subject a smaller boost.
 */
export function testBoost(topic: Topic, assessments: Assessment[], today: string): number {
  let boost = 1;
  for (const test of assessments) {
    if (test.kind !== "test" || test.subjectId !== topic.subjectId) continue;
    const days = daysBetween(today, test.date);
    if (days < 0 || days > 21) continue;
    const listsTopics = test.topicIds.length > 0;
    if (listsTopics && !test.topicIds.includes(topic.id)) continue;
    boost = Math.max(boost, 1 + (listsTopics ? 10 : 4) / (days + 2));
  }
  return boost;
}

export interface Priority {
  score: number;
  marks: number;
  weakness: number;
  urgency: number;
  review: number;
  test: number;
  daysToExam: number | null;
  examKind: AssessmentKind | null;
}

/** Everything the priority maths needs, worked out once per page load. */
export interface RevisionContext {
  today: string;
  assessments: Assessment[];
  averageWeight: Map<number, number>;
  daysToExam: Map<number, number | null>;
  examKind: Map<number, AssessmentKind | null>;
}

export function buildContext(
  subjects: Subject[],
  topics: Topic[],
  assessments: Assessment[],
  today: string,
): RevisionContext {
  const averageWeight = new Map<number, number>();
  const daysToExam = new Map<number, number | null>();
  const examKind = new Map<number, AssessmentKind | null>();
  for (const subject of subjects) {
    const own = topics.filter((t) => t.subjectId === subject.id && !t.archived);
    const total = own.reduce((sum, t) => sum + t.weight, 0);
    averageWeight.set(subject.id, own.length ? total / own.length : 1);
    const exam = nextExam(subject.id, assessments, today);
    daysToExam.set(subject.id, exam ? daysBetween(today, exam.date) : null);
    examKind.set(subject.id, exam?.kind ?? null);
  }
  return { today, assessments, averageWeight, daysToExam, examKind };
}

/**
 * Priority = marks weighting × weakness × urgency, then adjusted for spaced
 * repetition (is it due?) and any class test coming up on that topic.
 * "marks" is 1 for an average topic in its subject, 2 for one worth twice as many marks.
 */
export function topicPriority(topic: Topic, ctx: RevisionContext): Priority {
  const marks = topic.weight / (ctx.averageWeight.get(topic.subjectId) || 1);
  const weakness = WEAKNESS[topic.status];
  const daysToExam = ctx.daysToExam.get(topic.subjectId) ?? null;
  const urg = urgency(daysToExam);
  const review = reviewFactor(topic.nextReview, ctx.today);
  const test = testBoost(topic, ctx.assessments, ctx.today);
  const score = marks * weakness * urg * review * test;
  const examKind = ctx.examKind.get(topic.subjectId) ?? null;
  return { score, marks, weakness, urgency: urg, review, test, daysToExam, examKind };
}

// ---------- Weekly hours ----------

export interface WeeklyTarget {
  min: number;
  max: number;
  heavy: boolean;
  /** The exam that makes this a heavy week, e.g. "Maths mock". */
  reason: string | null;
  reasonDate: string | null;
  /** Subjects with a mock or final inside the heavy window. */
  examSubjectIds: number[];
}

/**
 * Normal weeks aim for the normal range. If any mock or final exam falls
 * within `heavyWeeksBefore` weeks of the start of this week, it's a heavy week.
 */
export function weeklyTarget(
  settings: Settings,
  assessments: Assessment[],
  subjects: Subject[],
  weekStartIso: string,
): WeeklyTarget {
  const windowDays = settings.heavyWeeksBefore * 7;
  const upcoming = assessments
    .filter((a) => a.kind !== "test")
    .map((a) => ({ a, days: daysBetween(weekStartIso, a.date) }))
    .filter(({ days }) => days >= 0 && days <= windowDays)
    .sort((x, y) => x.days - y.days);

  if (upcoming.length === 0) {
    return {
      min: settings.normalHoursMin,
      max: settings.normalHoursMax,
      heavy: false,
      reason: null,
      reasonDate: null,
      examSubjectIds: [],
    };
  }
  const first = upcoming[0];
  const subjectName = subjects.find((s) => s.id === first.a.subjectId)?.name ?? "";
  const kindName = first.a.kind === "mock" ? "mock" : "exam";
  return {
    min: settings.heavyHoursMin,
    max: settings.heavyHoursMax,
    heavy: true,
    reason: `${subjectName} ${kindName}`,
    reasonDate: first.a.date,
    examSubjectIds: [...new Set(upcoming.map(({ a }) => a.subjectId))],
  };
}

/**
 * Suggested hours per subject for a week.
 * The normal-week hours are shared out by need (urgency × how weak the topics are).
 * In a heavy week, the extra hours go to the subjects with an exam coming up,
 * with the nearest exam getting the most.
 */
export function subjectHourTargets(
  subjects: Subject[],
  topics: Topic[],
  ctx: RevisionContext,
  settings: Settings,
  target: WeeklyTarget,
): Map<number, number> {
  const normalMid = (settings.normalHoursMin + settings.normalHoursMax) / 2;
  const weekMid = (target.min + target.max) / 2;
  const extra = Math.max(weekMid - normalMid, 0);

  const need = new Map<number, number>();
  for (const subject of subjects) {
    const own = topics.filter((t) => t.subjectId === subject.id && !t.archived);
    const totalWeight = own.reduce((sum, t) => sum + t.weight, 0) || 1;
    const weakness = own.reduce((sum, t) => sum + t.weight * WEAKNESS[t.status], 0) / totalWeight;
    need.set(subject.id, urgency(ctx.daysToExam.get(subject.id) ?? null) * (0.5 + weakness));
  }
  const totalNeed = [...need.values()].reduce((a, b) => a + b, 0) || 1;

  const examUrgency = new Map<number, number>();
  for (const id of target.examSubjectIds) examUrgency.set(id, urgency(ctx.daysToExam.get(id) ?? null));
  const totalExamUrgency = [...examUrgency.values()].reduce((a, b) => a + b, 0) || 1;

  const hours = new Map<number, number>();
  for (const subject of subjects) {
    const base = (normalMid * need.get(subject.id)!) / totalNeed;
    const bonus = target.heavy ? (extra * (examUrgency.get(subject.id) ?? 0)) / totalExamUrgency : 0;
    hours.set(subject.id, base + bonus);
  }
  return hours;
}
