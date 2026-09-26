// Builds "Today's plan": homework due soon first, then the highest-priority topics.

import { dayOfWeek, daysBetween, relativeDays } from "./dates";
import type { Priority, WeeklyTarget } from "./revision";
import type { Homework, PlanItem, Status, Topic } from "./types";

export interface PlanInput {
  today: string;
  topics: Topic[];
  priorities: Map<number, Priority>;
  homework: Homework[];
  weekTarget: WeeklyTarget;
  /** Minutes already studied this week, not counting today. */
  minutesDoneBeforeToday: number;
  /** Suggested hours per subject this week. */
  subjectTargets: Map<number, number>;
  /** Minutes studied per subject so far this week. */
  subjectMinutes: Map<number, number>;
}

const MAX_TOPICS_PER_SUBJECT = 2;

/** Red topics get a bit more time, green retests a bit less. */
const TIME_SHARE: Record<Status, number> = { red: 1.3, amber: 1, unrated: 1, green: 0.7 };

const roundTo5 = (n: number) => Math.round(n / 5) * 5;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** Minutes to aim for today: what's left of this week's target, spread over the days left. */
export function dailyBudgetMinutes(target: WeeklyTarget, minutesDoneBeforeToday: number, today: string): number {
  const weekMinutes = ((target.min + target.max) / 2) * 60;
  const daysLeft = 7 - dayOfWeek(today);
  const perDay = Math.max(weekMinutes - minutesDoneBeforeToday, 0) / daysLeft;
  return clamp(roundTo5(perDay), 45, 240);
}

export function buildDailyPlan(input: PlanInput): PlanItem[] {
  const { today } = input;
  const budget = dailyBudgetMinutes(input.weekTarget, input.minutesDoneBeforeToday, today);

  // 1. Homework due in the next 2 days (or overdue) gets time blocked first.
  const homeworkItems: PlanItem[] = input.homework
    .filter((h) => !h.done && daysBetween(today, h.dueDate) <= 2)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .slice(0, 2)
    .map((h) => {
      const days = daysBetween(today, h.dueDate);
      return {
        kind: "homework",
        subjectId: h.subjectId,
        homeworkId: h.id,
        title: h.title,
        reason: days < 0 ? "Homework — overdue" : `Homework — due ${relativeDays(days)}`,
        minutes: h.minutes || 30,
      };
    });
  const homeworkMinutes = homeworkItems.reduce((sum, h) => sum + h.minutes, 0);

  // 2. Fill the rest with topics, 3–4 items in total.
  const topicCount = homeworkItems.length >= 2 ? 2 : homeworkItems.length === 1 ? 3 : budget >= 120 ? 4 : 3;

  // Subjects that are behind on this week's hours get a small nudge up.
  const behindBoost = (subjectId: number) => {
    const targetMinutes = (input.subjectTargets.get(subjectId) ?? 0) * 60;
    if (targetMinutes <= 0) return 1;
    const done = input.subjectMinutes.get(subjectId) ?? 0;
    return 1 + clamp((targetMinutes - done) / targetMinutes, 0, 1) * 0.5;
  };

  const ranked = input.topics
    .filter((t) => !t.archived && input.priorities.has(t.id))
    .map((t) => ({ topic: t, score: input.priorities.get(t.id)!.score * behindBoost(t.subjectId) }))
    .sort((a, b) => b.score - a.score);

  const picked: Topic[] = [];
  const perSubject = new Map<number, number>();
  for (const { topic } of ranked) {
    if (picked.length >= topicCount) break;
    const count = perSubject.get(topic.subjectId) ?? 0;
    if (count >= MAX_TOPICS_PER_SUBJECT) continue;
    perSubject.set(topic.subjectId, count + 1);
    picked.push(topic);
  }

  const topicMinutes = Math.max(budget - homeworkMinutes, 20 * picked.length);
  const totalShare = picked.reduce((sum, t) => sum + TIME_SHARE[t.status], 0) || 1;

  const topicItems: PlanItem[] = picked.map((topic) => ({
    kind: "topic",
    subjectId: topic.subjectId,
    topicId: topic.id,
    title: topic.name,
    reason: topicReason(topic, input.priorities.get(topic.id)!, today),
    minutes: clamp(roundTo5((topicMinutes * TIME_SHARE[topic.status]) / totalShare), 15, 75),
  }));

  return [...homeworkItems, ...topicItems];
}

export function topicReason(topic: Topic, priority: Priority, today: string): string {
  const parts: string[] = [];
  if (topic.status === "red") parts.push("Red — weak spot");
  else if (topic.status === "amber") parts.push("Amber — nearly there");
  else if (topic.status === "green") parts.push("Green — cold retest");
  else parts.push("Not rated yet — see how it feels");

  if (topic.nextReview && topic.lastReviewed && topic.nextReview <= today) parts.push("due for review");
  if (priority.test > 1) parts.push("class test coming up");
  if (priority.daysToExam !== null && priority.daysToExam <= 60) {
    parts.push(`${priority.examKind === "mock" ? "mock" : "exam"} ${relativeDays(priority.daysToExam)}`);
  }
  return parts.join(" · ");
}
