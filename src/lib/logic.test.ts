import { describe, expect, it } from "vitest";
import { addDays, dayOfWeek, daysBetween, todayISO, weekStart } from "./dates";
import { confidenceLevel, fastestGapClosers, gradeFromPercent, marksToGrade, masteryAdjustment, workingGrade } from "./grades";
import { buildDailyPlan, dailyBudgetMinutes } from "./plan";
import {
  buildContext,
  nextReviewDate,
  subjectHourTargets,
  testBoost,
  topicPriority,
  urgency,
  weeklyTarget,
} from "./revision";
import { studyStreak } from "./data";
import { DEFAULT_SETTINGS, type Assessment, type PaperScore, type StudySession, type Subject, type Topic } from "./types";

const maths: Subject = {
  id: 1,
  slug: "maths",
  name: "Maths",
  board: "",
  specCode: "1MA1",
  kind: "standard",
  targetGrade: 9,
  stretchGrade: null,
  boundaryMax: 240,
  boundaries: { "9": 210, "8": 176, "7": 143, "6": 113, "5": 83, "4": 53, "3": 38 },
  sortOrder: 0,
};
const geography: Subject = { ...maths, id: 2, slug: "geography", name: "Geography" };

let nextId = 1;
function topic(overrides: Partial<Topic> = {}): Topic {
  return {
    id: nextId++,
    subjectId: 1,
    name: "Topic",
    groupName: "",
    paper: "",
    weight: 2,
    status: "unrated",
    lastReviewed: null,
    nextReview: null,
    isSetText: false,
    archived: false,
    sortOrder: 0,
    ...overrides,
  };
}
function exam(overrides: Partial<Assessment>): Assessment {
  return { id: nextId++, subjectId: 1, kind: "mock", title: "Mock", date: "2026-10-12", tbc: false, topicIds: [], notes: "", ...overrides };
}
function score(percent: number, date: string): PaperScore {
  return { id: nextId++, subjectId: 1, topicId: null, paper: "", score: percent, maxScore: 100, date, kind: "past paper", aoScores: null, notes: "" };
}

describe("dates", () => {
  it("works out UK dates, weeks and gaps", () => {
    expect(todayISO(new Date("2026-09-26T23:30:00Z"))).toBe("2026-09-27"); // already Sunday in London (BST)
    expect(addDays("2026-09-30", 2)).toBe("2026-10-02");
    expect(daysBetween("2026-09-26", "2026-10-12")).toBe(16);
    expect(weekStart("2026-09-26")).toBe("2026-09-21"); // Saturday -> Monday
    expect(dayOfWeek("2026-09-21")).toBe(0);
  });
});

describe("spaced repetition", () => {
  it("brings topics back after 2 / 5 / 14 / 21 days", () => {
    expect(nextReviewDate("red", "amber", "2026-09-26")).toBe("2026-09-28");
    expect(nextReviewDate("amber", "red", "2026-09-26")).toBe("2026-10-01");
    expect(nextReviewDate("green", "amber", "2026-09-26")).toBe("2026-10-10");
    expect(nextReviewDate("green", "green", "2026-09-26")).toBe("2026-10-17");
  });
});

describe("priority", () => {
  it("rates weak, big, urgent topics highest", () => {
    const red = topic({ status: "red" });
    const green = topic({ status: "green" });
    const bigRed = topic({ status: "red", weight: 4 });
    const ctx = buildContext([maths], [red, green, bigRed], [exam({})], "2026-09-26");
    expect(topicPriority(red, ctx).score).toBeGreaterThan(topicPriority(green, ctx).score);
    expect(topicPriority(bigRed, ctx).score).toBeGreaterThan(topicPriority(red, ctx).score);
    expect(urgency(7)).toBeGreaterThan(urgency(30));
    expect(urgency(30)).toBeGreaterThan(urgency(250));
  });

  it("holds back topics that aren't due for review yet", () => {
    const due = topic({ status: "amber", lastReviewed: "2026-09-20", nextReview: "2026-09-25" });
    const notDue = topic({ status: "amber", lastReviewed: "2026-09-25", nextReview: "2026-09-30" });
    const ctx = buildContext([maths], [due, notDue], [], "2026-09-26");
    expect(topicPriority(due, ctx).score).toBeGreaterThan(topicPriority(notDue, ctx).score * 3);
  });

  it("boosts topics in a class test, more as it gets closer", () => {
    const t = topic({});
    const other = topic({});
    const soon = [exam({ kind: "test", date: "2026-09-28", topicIds: [t.id] })];
    const later = [exam({ kind: "test", date: "2026-10-10", topicIds: [t.id] })];
    expect(testBoost(t, soon, "2026-09-26")).toBeGreaterThan(testBoost(t, later, "2026-09-26"));
    expect(testBoost(other, soon, "2026-09-26")).toBe(1);
  });
});

describe("weekly hours", () => {
  const assessments = [exam({ date: "2026-10-12" }), exam({ subjectId: 2, date: "2027-06-01" })];

  it("switches to a heavy week within 4 weeks of a mock", () => {
    expect(weeklyTarget(DEFAULT_SETTINGS, assessments, [maths, geography], "2026-09-21")).toMatchObject({
      heavy: true,
      min: 20,
      max: 24,
      examSubjectIds: [1],
    });
    expect(weeklyTarget(DEFAULT_SETTINGS, assessments, [maths, geography], "2026-11-02")).toMatchObject({
      heavy: false,
      min: 8,
      max: 12,
    });
  });

  it("gives the extra heavy-week hours to the subject with the exam", () => {
    const topics = [topic({ subjectId: 1 }), topic({ subjectId: 2 })];
    const ctx = buildContext([maths, geography], topics, assessments, "2026-09-26");
    const target = weeklyTarget(DEFAULT_SETTINGS, assessments, [maths, geography], "2026-09-21");
    const hours = subjectHourTargets([maths, geography], topics, ctx, DEFAULT_SETTINGS, target);
    expect(hours.get(1)! + hours.get(2)!).toBeCloseTo(22);
    expect(hours.get(1)!).toBeGreaterThan(hours.get(2)! * 3);
  });
});

describe("grades", () => {
  it("turns percentages into fractional grades", () => {
    expect(gradeFromPercent(0.9, maths)).toBe(9);
    expect(gradeFromPercent(143 / 240, maths)).toBeCloseTo(7);
    expect(gradeFromPercent((143 + 176) / 2 / 240, maths)).toBeCloseTo(7.5);
  });

  it("estimates a working grade with confidence based on how many scores", () => {
    const topics = [topic({ status: "amber" })];
    const none = workingGrade(maths, [], topics, "2026-09-26");
    expect(none.grade).toBeNull();
    expect(none.confidence).toBe("none");

    const one = workingGrade(maths, [score(70, "2026-09-20")], topics, "2026-09-26");
    expect(one.confidence).toBe("low");
    expect(one.grade).toBeGreaterThan(7);
    expect(one.grade).toBeLessThan(8);

    const six = [70, 71, 72, 69, 70, 71].map((p, i) => score(p, `2026-09-1${i}`));
    expect(workingGrade(maths, six, topics, "2026-09-26").confidence).toBe("high");
    expect(confidenceLevel([0.4, 0.9, 0.5])).toBe("low"); // very inconsistent scores
  });

  it("only lets rated topics nudge the grade", () => {
    expect(masteryAdjustment([topic({}), topic({})])).toBe(0);
    expect(masteryAdjustment([topic({ status: "green" }), topic({ status: "green" })])).toBeCloseTo(0.3);
    expect(masteryAdjustment([topic({ status: "red" }), topic({})])).toBeLessThan(0);
  });

  it("works out marks short of the target and the best topics to close the gap", () => {
    expect(marksToGrade(0.8, 9, maths)).toBe(18); // 210 - 192
    expect(marksToGrade(0.9, 9, maths)).toBe(-6);
    const topics = [topic({ status: "green", weight: 10 }), topic({ status: "red", weight: 5 }), topic({ status: "red", weight: 1 })];
    const closers = fastestGapClosers(maths, topics);
    expect(closers[0].topic.id).toBe(topics[1].id);
  });
});

describe("daily plan", () => {
  const target = { min: 8, max: 12, heavy: false, reason: null, reasonDate: null, examSubjectIds: [] };

  it("spreads what's left of the week over the days left", () => {
    expect(dailyBudgetMinutes(target, 0, "2026-09-21")).toBe(85); // 600 min / 7 days
    expect(dailyBudgetMinutes(target, 600, "2026-09-26")).toBe(45); // target met: minimum
  });

  it("puts homework first and never more than 2 topics from one subject", () => {
    const topics = [
      ...Array.from({ length: 5 }, () => topic({ subjectId: 1, status: "red" })),
      topic({ subjectId: 2, status: "amber" }),
      topic({ subjectId: 2, status: "red" }),
    ];
    const assessments = [exam({ date: "2026-10-12" })];
    const ctx = buildContext([maths, geography], topics, assessments, "2026-09-26");
    const priorities = new Map(topics.map((t) => [t.id, topicPriority(t, ctx)]));
    const homework = [
      { id: 99, subjectId: 2, title: "Worksheet", dueDate: "2026-09-27", notes: "", done: false, source: "manual", className: "", minutes: 40 },
    ];
    const plan = buildDailyPlan({
      today: "2026-09-26",
      topics,
      priorities,
      homework,
      weekTarget: target,
      minutesDoneBeforeToday: 0,
      subjectTargets: new Map(),
      subjectMinutes: new Map(),
    });
    expect(plan[0]).toMatchObject({ kind: "homework", homeworkId: 99, minutes: 40 });
    expect(plan).toHaveLength(4);
    expect(plan.filter((p) => p.subjectId === 1)).toHaveLength(2);
  });
});

describe("streak", () => {
  const session = (date: string): StudySession => ({
    id: nextId++,
    subjectId: 1,
    date,
    minutes: 30,
    topicIds: [],
    wentWell: "",
    struggles: "",
    source: "app",
  });

  it("counts days in a row, and still counts if today isn't logged yet", () => {
    const sessions = ["2026-09-23", "2026-09-24", "2026-09-25"].map(session);
    expect(studyStreak(sessions, "2026-09-26")).toEqual({ days: 3, studiedToday: false });
    expect(studyStreak([...sessions, session("2026-09-26")], "2026-09-26")).toEqual({ days: 4, studiedToday: true });
    expect(studyStreak(sessions, "2026-09-28").days).toBe(0);
  });
});
