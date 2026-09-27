// Loads data for the pages and works out the numbers shown on them.

import { connection } from "next/server";
import type postgres from "postgres";
import { db, withTimeout, type Sql } from "./db";
import { addDays, isValidTimeZone, todayISO, weekStart } from "./dates";
import { buildDailyPlan } from "./plan";
import {
  buildContext,
  subjectHourTargets,
  topicPriority,
  weeklyTarget,
  type Priority,
  type RevisionContext,
  type WeeklyTarget,
} from "./revision";
import {
  DEFAULT_SETTINGS,
  type Assessment,
  type Homework,
  type Mistake,
  type PaperScore,
  type PlanItem,
  type Settings,
  type StudySession,
  type Subject,
  type Topic,
} from "./types";

export interface Core {
  today: string;
  subjects: Subject[];
  /** All topics, including ones you've marked "not studying". */
  allTopics: Topic[];
  topics: Topic[];
  assessments: Assessment[];
  homework: Homework[];
  sessions: StudySession[];
  settings: Settings;
  teamsConnected: boolean;
}

const TOPIC_COLUMNS = `id, subject_id, name, group_name, paper, weight, status, last_reviewed, next_review,
  is_set_text, archived, sort_order`;

export async function loadCore(): Promise<Core> {
  await connection(); // always load fresh data, never a cached copy
  const sql = await db();
  const roughToday = todayISO(); // the exact "today" needs the time zone setting, loaded below
  const [subjects, allTopics, assessments, homework, sessions, settingRows, teams] = await withTimeout(Promise.all([
    sql<Subject[]>`select id, slug, name, board, spec_code, kind, target_grade, stretch_grade, boundaries,
                          boundary_max, sort_order
                   from subjects order by sort_order, id`,
    sql.unsafe<Topic[]>(`select ${TOPIC_COLUMNS} from topics order by subject_id, sort_order, id`),
    sql<Assessment[]>`select id, subject_id, kind, title, date, tbc, topic_ids, notes
                      from assessments order by date, id`,
    sql<Homework[]>`select id, subject_id, title, due_date, notes, done, source, class_name, minutes, link
                    from homework where due_date >= ${addDays(roughToday, -30)} order by due_date, id`,
    sql<StudySession[]>`select id, subject_id, date, minutes, topic_ids, went_well, struggles, source
                        from sessions where date >= ${addDays(roughToday, -400)} order by date desc, id desc`,
    sql<{ key: string; value: number | string }[]>`select key, value from settings`,
    sql<{ connected: boolean }[]>`select exists(select 1 from integrations
                                   where provider = 'teams' and data ? 'refreshToken') as connected`,
  ]), 10_000, "Loading your data");

  const settings = settingsFrom(settingRows);
  const today = todayISO(new Date(), settings.timeZone);

  return {
    today,
    subjects: [...subjects],
    allTopics: [...allTopics],
    topics: allTopics.filter((t) => !t.archived),
    assessments: [...assessments],
    homework: [...homework],
    sessions: [...sessions],
    settings,
    teamsConnected: Boolean(teams[0]?.connected),
  };
}

export function settingsFrom(rows: readonly { key: string; value: number | string }[]): Settings {
  const settings: Settings = { ...DEFAULT_SETTINGS };
  for (const { key, value } of rows) {
    if (key === "timeZone") {
      if (isValidTimeZone(String(value))) settings.timeZone = String(value);
    } else if (key in settings && Number.isFinite(Number(value))) {
      (settings as unknown as Record<string, number>)[key] = Number(value);
    }
  }
  return settings;
}

/** Today's date in your time zone (for places that don't load everything). */
export async function userToday(sql: Sql): Promise<string> {
  const rows = await sql<{ key: string; value: string }[]>`select key, value from settings where key = 'timeZone'`;
  return todayISO(new Date(), settingsFrom(rows).timeZone);
}

export interface Overview {
  ctx: RevisionContext;
  priorities: Map<number, Priority>;
  weekStart: string;
  weekTarget: WeeklyTarget;
  subjectTargets: Map<number, number>;
  subjectMinutes: Map<number, number>;
  weekMinutes: number;
  minutesBeforeToday: number;
  streak: { days: number; studiedToday: boolean };
}

export function sumMinutesBySubject(sessions: StudySession[]): Map<number, number> {
  const totals = new Map<number, number>();
  for (const s of sessions) totals.set(s.subjectId, (totals.get(s.subjectId) ?? 0) + s.minutes);
  return totals;
}

/** Days in a row with at least one logged study session (today or yesterday counts as "still going"). */
export function studyStreak(sessions: StudySession[], today: string) {
  const studied = new Set(sessions.filter((s) => s.minutes > 0).map((s) => s.date));
  let day = studied.has(today) ? today : addDays(today, -1);
  let days = 0;
  while (studied.has(day)) {
    days++;
    day = addDays(day, -1);
  }
  return { days, studiedToday: studied.has(today) };
}

export function weekSummary(core: Core, start: string) {
  const end = addDays(start, 6);
  const ctx = buildContext(core.subjects, core.topics, core.assessments, core.today);
  const weekTarget = weeklyTarget(core.settings, core.assessments, core.subjects, start);
  const subjectTargets = subjectHourTargets(core.subjects, core.topics, ctx, core.settings, weekTarget);
  const sessions = core.sessions.filter((s) => s.date >= start && s.date <= end);
  return {
    ctx,
    weekTarget,
    subjectTargets,
    sessions,
    subjectMinutes: sumMinutesBySubject(sessions),
    weekMinutes: sessions.reduce((sum, s) => sum + s.minutes, 0),
  };
}

export function overview(core: Core): Overview {
  const start = weekStart(core.today);
  const week = weekSummary(core, start);
  const priorities = new Map(core.topics.map((t) => [t.id, topicPriority(t, week.ctx)]));
  return {
    ctx: week.ctx,
    priorities,
    weekStart: start,
    weekTarget: week.weekTarget,
    subjectTargets: week.subjectTargets,
    subjectMinutes: week.subjectMinutes,
    weekMinutes: week.weekMinutes,
    minutesBeforeToday: week.sessions.filter((s) => s.date < core.today).reduce((sum, s) => sum + s.minutes, 0),
    streak: studyStreak(core.sessions, core.today),
  };
}

/**
 * Today's plan is worked out once per day and saved, so it doesn't reshuffle
 * while you're working through it. Adding homework or a test, or tapping
 * "Rebuild", makes a fresh one.
 */
export async function todaysPlan(core: Core, ov: Overview): Promise<PlanItem[]> {
  const sql = await db();
  const [saved] = await sql<{ items: PlanItem[] }[]>`select items from daily_plans where date = ${core.today}`;
  if (saved) return saved.items;

  const items = buildDailyPlan({
    today: core.today,
    topics: core.topics,
    priorities: ov.priorities,
    homework: core.homework,
    weekTarget: ov.weekTarget,
    minutesDoneBeforeToday: ov.minutesBeforeToday,
    subjectTargets: ov.subjectTargets,
    subjectMinutes: ov.subjectMinutes,
  });
  await sql`insert into daily_plans (date, items) values (${core.today}, ${sql.json(items as unknown as postgres.JSONValue)})
            on conflict (date) do nothing`;
  return items;
}

export async function loadScores(subjectId?: number): Promise<PaperScore[]> {
  const sql = await db();
  const rows = subjectId
    ? await sql<PaperScore[]>`select id, subject_id, topic_id, paper, score, max_score, date, kind, ao_scores, notes
                              from paper_scores where subject_id = ${subjectId} order by date desc, id desc`
    : await sql<PaperScore[]>`select id, subject_id, topic_id, paper, score, max_score, date, kind, ao_scores, notes
                              from paper_scores order by date desc, id desc`;
  return [...rows];
}

export async function loadMistakes(subjectId?: number): Promise<Mistake[]> {
  const sql = await db();
  const rows = subjectId
    ? await sql<Mistake[]>`select id, subject_id, topic_id, error_type, note, date
                           from mistakes where subject_id = ${subjectId} order by date desc, id desc`
    : await sql<Mistake[]>`select id, subject_id, topic_id, error_type, note, date
                           from mistakes order by date desc, id desc`;
  return [...rows];
}

export function subjectName(core: Core, subjectId: number | null): string {
  if (subjectId === null) return "General";
  return core.subjects.find((s) => s.id === subjectId)?.name ?? "";
}
