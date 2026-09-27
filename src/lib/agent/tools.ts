// The commands Claude chats and Jarvis can use (the "connector").
// Each tool has a name, a description written for an AI assistant, an input
// schema (checked before running) and a function that does the work.

import { z } from "zod";
import type { Sql } from "../db";
import { addDays, daysBetween, dayOfWeek } from "../dates";
import { loadCore, loadMistakes, loadScores, overview, todaysPlan, type Core } from "../data";
import { fastestGapClosers, formatGrade, gradeFromPercent, markSchemeLevel, marksToGrade, workingGrade } from "../grades";
import { plural } from "../format";
import { clearTodaysPlan, rateTopic } from "../mutations";
import { topicReason } from "../plan";
import type { Status, Subject, Topic } from "../types";
import { findSubject, findTopic, normalise } from "./match";

export interface ToolContext {
  sql: Sql;
  /** Who is calling, e.g. "claude" or the name of a Jarvis key. Saved as the source of anything added. */
  caller: string;
}

export class ToolError extends Error {}

interface Tool<S extends z.ZodObject> {
  name: string;
  title: string;
  description: string;
  input: S;
  readOnly?: boolean;
  run: (args: z.infer<S>, ctx: ToolContext) => Promise<unknown>;
}

const tool = <S extends z.ZodObject>(t: Tool<S>) => t;

// ---------- Shared inputs ----------

const subjectArg = z
  .string()
  .describe('Subject name, e.g. "Maths", "Biology", "Chemistry", "Physics", "Business", "Economics", "Geography", "English Literature", "English Language".');
const dateArg = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
const statusArg = z.enum(["red", "amber", "green"]);

// ---------- Helpers ----------

function subjectOrFail(core: Core, name: string): Subject {
  const match = findSubject(core.subjects, name);
  if ("error" in match) throw new ToolError(match.error);
  return match.subject;
}

function topicsOf(core: Core, subject: Subject): Topic[] {
  return core.topics.filter((t) => t.subjectId === subject.id);
}

function topicOrFail(core: Core, subject: Subject, name: string): Topic {
  const { topic, suggestions } = findTopic(topicsOf(core, subject), name);
  if (topic) return topic;
  throw new ToolError(
    `No ${subject.name} topic matches "${name}".` +
      (suggestions.length ? ` Did you mean: ${suggestions.join("; ")}?` : " Call list_topics to see the exact names."),
  );
}

const round = (n: number, places = 2) => Math.round(n * 10 ** places) / 10 ** places;

function comingUp(core: Core, days: number, subjectId?: number) {
  const within = (date: string) => date >= core.today && daysBetween(core.today, date) <= days;
  const homework = core.homework
    .filter((h) => !h.done && daysBetween(core.today, h.dueDate) <= days)
    .filter((h) => subjectId === undefined || h.subjectId === subjectId)
    .map((h) => ({
      type: "homework",
      title: h.title,
      subject: core.subjects.find((s) => s.id === h.subjectId)?.name ?? "General",
      due: h.dueDate,
      days_left: daysBetween(core.today, h.dueDate),
      notes: h.notes || undefined,
    }));
  const tests = core.assessments
    .filter((a) => within(a.date) && (subjectId === undefined || a.subjectId === subjectId))
    .map((a) => ({
      type: a.kind === "test" ? "class test" : a.kind === "mock" ? "mock" : "exam",
      title: a.title,
      subject: core.subjects.find((s) => s.id === a.subjectId)?.name ?? "",
      date: a.date,
      days_left: daysBetween(core.today, a.date),
      date_confirmed: !a.tbc,
      topics: a.topicIds.map((id) => core.allTopics.find((t) => t.id === id)?.name).filter(Boolean),
    }));
  return [...homework, ...tests].sort((a, b) => a.days_left - b.days_left);
}

function gradeSummary(subject: Subject, core: Core, scores: Awaited<ReturnType<typeof loadScores>>) {
  const topics = topicsOf(core, subject);
  const estimate = workingGrade(subject, scores, topics, core.today);
  const gap = (grade: number) => {
    const marks = marksToGrade(estimate.averagePercent, grade, subject);
    if (marks === null) return null;
    return marks > 0
      ? `~${plural(marks, "mark")} short of a ${grade} (out of ${subject.boundaryMax})`
      : `~${plural(-marks, "mark")} above the ${grade} boundary`;
  };
  return {
    working_grade: estimate.grade === null ? null : formatGrade(estimate.grade),
    confidence: estimate.confidence,
    based_on_scores: estimate.scoreCount,
    target_grade: subject.targetGrade,
    stretch_grade: subject.stretchGrade ?? undefined,
    gap_to_target: gap(subject.targetGrade),
    gap_to_stretch: subject.stretchGrade ? gap(subject.stretchGrade) : undefined,
    fastest_gap_closers: fastestGapClosers(subject, topics).map((c) => ({ topic: c.topic.name, status: c.topic.status, marks_available: Math.round(c.marks) })),
  };
}

// ---------- The tools ----------

export const TOOLS = [
  tool({
    name: "get_priorities",
    title: "What to revise now",
    description:
      "Returns the student's top revision priorities right now across all subjects, today's plan, this week's hours against the target, and homework/tests in the next 14 days. Use this to decide what to study.",
    readOnly: true,
    input: z.object({ limit: z.number().int().min(1).max(20).optional().describe("How many top topics to return (default 8).") }),
    async run({ limit = 8 }) {
      const core = await loadCore();
      const ov = overview(core);
      const plan = await todaysPlan(core, ov);
      const doneToday = new Set(core.sessions.filter((s) => s.date === core.today).flatMap((s) => s.topicIds));
      const top = [...core.topics]
        .sort((a, b) => (ov.priorities.get(b.id)?.score ?? 0) - (ov.priorities.get(a.id)?.score ?? 0))
        .slice(0, limit)
        .map((t) => ({
          subject: core.subjects.find((s) => s.id === t.subjectId)?.name,
          topic: t.name,
          status: t.status,
          priority: round(ov.priorities.get(t.id)!.score),
          why: topicReason(t, ov.priorities.get(t.id)!, core.today),
        }));
      return {
        today: core.today,
        week: {
          hours_done: round(ov.weekMinutes / 60, 1),
          target_hours: `${ov.weekTarget.min}-${ov.weekTarget.max}`,
          heavy_week: ov.weekTarget.heavy ? `${ov.weekTarget.reason} on ${ov.weekTarget.reasonDate}` : false,
        },
        streak_days: ov.streak.days,
        todays_plan: plan.map((item) => ({
          subject: core.subjects.find((s) => s.id === item.subjectId)?.name ?? "General",
          task: item.title,
          minutes: item.minutes,
          why: item.reason,
          done: item.topicId ? doneToday.has(item.topicId) : core.homework.find((h) => h.id === item.homeworkId)?.done ?? false,
        })),
        top_topics: top,
        coming_up: comingUp(core, 14),
      };
    },
  }),

  tool({
    name: "get_session_brief",
    title: "Start a study session",
    description:
      "Call at the START of a study session for one subject. Returns the priority topics to cover (with reasons), topics due for review, suggested session length, upcoming homework/tests for the subject, recent mistakes to watch out for, how the last sessions went, and the working grade versus target.",
    readOnly: true,
    input: z.object({ subject: subjectArg }),
    async run({ subject: name }) {
      const core = await loadCore();
      const subject = subjectOrFail(core, name);
      const ov = overview(core);
      const plan = await todaysPlan(core, ov);
      const topics = topicsOf(core, subject);
      const prioritised = [...topics].sort((a, b) => (ov.priorities.get(b.id)?.score ?? 0) - (ov.priorities.get(a.id)?.score ?? 0));

      const plannedMinutes = plan.filter((i) => i.subjectId === subject.id).reduce((sum, i) => sum + i.minutes, 0);
      const weekLeft = Math.max((ov.subjectTargets.get(subject.id) ?? 0) * 60 - (ov.subjectMinutes.get(subject.id) ?? 0), 0);
      const suggestedMinutes = plannedMinutes || Math.min(90, Math.max(20, Math.round(weekLeft / (7 - dayOfWeek(core.today)) / 5) * 5));

      const mistakes = (await loadMistakes(subject.id)).filter((m) => m.date >= addDays(core.today, -30));
      const counts = new Map<string, number>();
      for (const m of mistakes) counts.set(m.errorType, (counts.get(m.errorType) ?? 0) + 1);
      const topicName = (id: number) => core.allTopics.find((t) => t.id === id)?.name;

      return {
        subject: subject.name,
        spec: `${subject.board} ${subject.specCode}`,
        suggested_minutes: suggestedMinutes,
        priority_topics: prioritised.slice(0, 5).map((t) => ({
          topic: t.name,
          status: t.status,
          why: topicReason(t, ov.priorities.get(t.id)!, core.today),
        })),
        due_for_review: topics
          .filter((t) => t.lastReviewed && t.nextReview && t.nextReview <= core.today)
          .slice(0, 8)
          .map((t) => ({ topic: t.name, status: t.status, due: t.nextReview })),
        coming_up: comingUp(core, 30, subject.id),
        recent_mistakes: [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([type, count]) => ({ type, count })),
        last_sessions: core.sessions
          .filter((s) => s.subjectId === subject.id)
          .slice(0, 3)
          .map((s) => ({ date: s.date, minutes: s.minutes, topics: s.topicIds.map(topicName).filter(Boolean), struggles: s.struggles || undefined })),
        ...gradeSummary(subject, core, await loadScores(subject.id)),
        at_the_end:
          "When the session ends, call log_session with every topic covered and an honest status for each: red = still weak, amber = getting there, green = could answer exam questions confidently.",
      };
    },
  }),

  tool({
    name: "log_session",
    title: "Log a study session",
    description:
      "Call at the END of every study session. Records the time spent and, for each topic covered, an honest judgement: status red (still weak, needs a lot more work), amber (getting there, needs more practice) or green (confident, could do exam questions). If you only know whether more time is needed, set needs_more_time instead of status. Also records mistakes made and any scores. This updates spaced repetition and tomorrow's plan.",
    input: z.object({
      subject: subjectArg,
      minutes: z.number().int().min(1).max(600).describe("How long the session lasted."),
      topics: z
        .array(
          z.union([
            z.string(),
            z.object({
              topic: z.string().describe("Topic name as used in the app (see list_topics)."),
              status: statusArg.optional().describe("Honest judgement after the session."),
              needs_more_time: z.boolean().optional(),
            }),
          ]),
        )
        .default([])
        .describe("Topics covered. Prefer objects with a status for each."),
      date: dateArg.optional().describe("Date of the session (default today)."),
      what_went_well: z.string().optional(),
      struggles: z.string().optional(),
      error_types: z
        .array(z.string())
        .optional()
        .describe('Mistake types, e.g. "Didn\'t answer the question asked", "Wrong rule or method chosen", "Arithmetic slip".'),
      scores: z
        .array(
          z.object({
            paper: z.string().optional().describe("Paper or question, e.g. 'June 2023 Paper 2' or 'Q5 practice'."),
            score: z.number().min(0),
            max_score: z.number().positive(),
            question_type: z.string().optional().describe("For English: the question type or set text."),
          }),
        )
        .optional()
        .describe("Marks from any practice questions or papers done in the session."),
      needs_more_time: z.boolean().optional().describe("Overall judgement, used for topics without their own status."),
      suggested_next_review: dateArg.optional().describe("If a topic should come back sooner than usual, the date (YYYY-MM-DD)."),
    }),
    async run(args, { sql, caller }) {
      const core = await loadCore();
      const subject = subjectOrFail(core, args.subject);
      const date = args.date ?? core.today;
      if (date > core.today) throw new ToolError("The session date can't be in the future.");

      const found: { topic: Topic; status?: Status; needsMore?: boolean }[] = [];
      const notFound: { name: string; suggestions: string[] }[] = [];
      for (const entry of args.topics) {
        const item = typeof entry === "string" ? { topic: entry } : entry;
        const { topic, suggestions } = findTopic(topicsOf(core, subject), item.topic);
        if (topic) found.push({ topic, status: item.status, needsMore: item.needs_more_time ?? args.needs_more_time });
        else notFound.push({ name: item.topic, suggestions });
      }

      const [{ id }] = await sql<{ id: number }[]>`
        insert into sessions (subject_id, date, minutes, topic_ids, went_well, struggles, source)
        values (${subject.id}, ${date}, ${args.minutes}, ${found.map((f) => f.topic.id)},
                ${args.what_went_well ?? ""}, ${args.struggles ?? ""}, ${caller})
        returning id`;

      const updated = [];
      for (const { topic, status, needsMore } of found) {
        let newStatus: Status | undefined = status;
        if (!newStatus && needsMore === false) newStatus = "green";
        if (!newStatus && needsMore === true) newStatus = topic.status === "red" ? "red" : "amber";
        if (newStatus) {
          const next = await rateTopic(sql, topic.id, newStatus, id, args.suggested_next_review ?? null);
          updated.push({ topic: topic.name, status: newStatus, next_review: next });
        } else {
          updated.push({ topic: topic.name, status: topic.status, note: "no judgement given, status unchanged" });
        }
      }

      const single = found.length === 1 ? found[0].topic.id : null;
      for (const errorType of args.error_types ?? []) {
        await sql`insert into mistakes (subject_id, topic_id, error_type, note, date)
                  values (${subject.id}, ${single}, ${errorType}, ${"from " + caller}, ${date})`;
      }
      for (const s of args.scores ?? []) {
        const questionTopic = s.question_type ? findTopic(topicsOf(core, subject), s.question_type).topic : null;
        await sql`insert into paper_scores (subject_id, topic_id, paper, score, max_score, date, kind, notes)
                  values (${subject.id}, ${questionTopic?.id ?? single}, ${s.paper ?? ""}, ${s.score}, ${s.max_score},
                          ${date}, 'practice question', ${"from " + caller})`;
      }

      return {
        saved: true,
        session_id: id,
        subject: subject.name,
        date,
        minutes: args.minutes,
        topics: updated,
        topics_not_found: notFound.length ? notFound : undefined,
        mistakes_logged: args.error_types?.length ?? 0,
        scores_logged: args.scores?.length ?? 0,
      };
    },
  }),

  tool({
    name: "get_recent_sessions",
    title: "Recent study sessions",
    description:
      "Lists study sessions already logged (by the app, Claude chats or Jarvis) over the last few days. Check this before logging a session you found elsewhere, so nothing is counted twice.",
    readOnly: true,
    input: z.object({ days: z.number().int().min(1).max(30).optional().describe("How many days back (default 7).") }),
    async run({ days = 7 }) {
      const core = await loadCore();
      const since = addDays(core.today, -days + 1);
      return {
        today: core.today,
        sessions: core.sessions
          .filter((s) => s.date >= since)
          .map((s) => ({
            date: s.date,
            subject: core.subjects.find((x) => x.id === s.subjectId)?.name,
            minutes: s.minutes,
            topics: s.topicIds.map((id) => core.allTopics.find((t) => t.id === id)?.name).filter(Boolean),
            logged_by: s.source,
          })),
      };
    },
  }),

  tool({
    name: "update_topic",
    title: "Rate a topic",
    description: "Sets a topic's status: red (weak), amber (getting there) or green (confident). Schedules its next review automatically.",
    input: z.object({ subject: subjectArg, topic: z.string(), status: statusArg }),
    async run({ subject: name, topic: topicName, status }, { sql }) {
      const core = await loadCore();
      const subject = subjectOrFail(core, name);
      const topic = topicOrFail(core, subject, topicName);
      const next = await rateTopic(sql, topic.id, status);
      return { subject: subject.name, topic: topic.name, status, next_review: next };
    },
  }),

  tool({
    name: "log_paper_score",
    title: "Log a paper or question score",
    description:
      "Records a past paper, mock, practice question or essay score. Used for the working grade. For English, give question_type (the question type or set text) and, if known, marks per assessment objective.",
    input: z.object({
      subject: subjectArg,
      paper: z.string().describe("Which paper or question, e.g. 'June 2023 Paper 1H'."),
      score: z.number().min(0),
      max_score: z.number().positive(),
      date: dateArg.optional(),
      kind: z.enum(["past paper", "mock", "practice question", "essay", "class test", "homework"]).optional(),
      question_type: z.string().optional().describe("English only: question type (Language) or set text (Literature)."),
      ao_scores: z
        .record(z.string().regex(/^AO\d$/), z.object({ score: z.number().min(0), max: z.number().positive() }))
        .optional()
        .describe('English only: marks per assessment objective, e.g. {"AO4": {"score": 21, "max": 27}}.'),
    }),
    async run(args, { sql, caller }) {
      const core = await loadCore();
      const subject = subjectOrFail(core, args.subject);
      if (args.score > args.max_score) throw new ToolError("score can't be more than max_score.");
      const topic = args.question_type ? topicOrFail(core, subject, args.question_type) : null;
      await sql`
        insert into paper_scores (subject_id, topic_id, paper, score, max_score, date, kind, ao_scores, notes)
        values (${subject.id}, ${topic?.id ?? null}, ${args.paper}, ${args.score}, ${args.max_score},
                ${args.date ?? core.today}, ${args.kind ?? "past paper"},
                ${args.ao_scores ? sql.json(args.ao_scores) : null}, ${"from " + caller})`;
      const percent = args.score / args.max_score;
      const isEnglish = subject.kind !== "standard";
      return {
        saved: true,
        subject: subject.name,
        percent: Math.round(percent * 100),
        ...(isEnglish ? { mark_scheme_level: markSchemeLevel(args.score, args.max_score) } : { grade_equivalent: formatGrade(gradeFromPercent(percent, subject)) }),
        ...gradeSummary(subject, core, await loadScores(subject.id)),
      };
    },
  }),

  tool({
    name: "add_quote",
    title: "Add an English Literature quote",
    description: "Adds a quote to the quotes bank for one of the English Literature set texts (used by the quote quiz).",
    input: z.object({
      text: z.string().min(2).describe("The quote, exactly as in the text."),
      set_text: z.string().describe("Which set text, e.g. 'An Inspector Calls' or 'Anthology poetry'."),
      theme: z.string().optional(),
      character: z.string().optional(),
    }),
    async run({ text, set_text, theme, character }, { sql }) {
      const core = await loadCore();
      const lit = core.subjects.find((s) => s.kind === "english_lit");
      if (!lit) throw new ToolError("English Literature isn't set up.");
      const setTexts = topicsOf(core, lit).filter((t) => t.isSetText);
      const { topic, suggestions } = findTopic(setTexts, set_text);
      if (!topic) {
        throw new ToolError(`No set text matches "${set_text}". Set texts: ${(suggestions.length ? suggestions : setTexts.map((t) => t.name)).join("; ")}.`);
      }
      const [existing] = await sql`select id from quotes where topic_id = ${topic.id} and lower(text) = ${text.toLowerCase()}`;
      if (!existing) {
        await sql`insert into quotes (topic_id, text, theme, character) values (${topic.id}, ${text}, ${theme ?? ""}, ${character ?? ""})`;
      }
      for (const [kind, name] of [["theme", theme], ["character", character]] as const) {
        if (!name) continue;
        const [note] = await sql`select id from text_notes where topic_id = ${topic.id} and kind = ${kind} and lower(name) = ${name.toLowerCase()}`;
        if (!note) await sql`insert into text_notes (topic_id, kind, name) values (${topic.id}, ${kind}, ${name})`;
      }
      return { saved: !existing, already_there: Boolean(existing), set_text: topic.name };
    },
  }),

  tool({
    name: "get_subject_status",
    title: "How a subject is going",
    description:
      "Returns every topic's red/amber/green status for a subject, the working grade with its confidence level, the gap to the target grade, and the topics that would close the gap fastest.",
    readOnly: true,
    input: z.object({ subject: subjectArg }),
    async run({ subject: name }) {
      const core = await loadCore();
      const subject = subjectOrFail(core, name);
      const topics = topicsOf(core, subject);
      const count = (s: Status) => topics.filter((t) => t.status === s).length;
      const next = core.assessments.filter((a) => a.subjectId === subject.id && a.kind !== "test" && a.date >= core.today)[0];
      return {
        subject: subject.name,
        spec: `${subject.board} ${subject.specCode}`,
        counts: { red: count("red"), amber: count("amber"), green: count("green"), not_rated: count("unrated") },
        next_exam: next ? { title: next.title, date: next.date, days_left: daysBetween(core.today, next.date), date_confirmed: !next.tbc } : null,
        ...gradeSummary(subject, core, await loadScores(subject.id)),
        topics: topics.map((t) => ({ topic: t.name, group: t.groupName, status: t.status, next_review: t.nextReview ?? undefined })),
      };
    },
  }),

  tool({
    name: "list_topics",
    title: "List a subject's topics",
    description: "Lists the exact topic names (and statuses) for a subject. Use these names in other tools.",
    readOnly: true,
    input: z.object({ subject: subjectArg }),
    async run({ subject: name }) {
      const core = await loadCore();
      const subject = subjectOrFail(core, name);
      const groups: Record<string, { topic: string; status: Status }[]> = {};
      for (const t of topicsOf(core, subject)) (groups[t.groupName] ??= []).push({ topic: t.name, status: t.status });
      return { subject: subject.name, groups };
    },
  }),

  tool({
    name: "add_homework",
    title: "Add homework",
    description:
      "Adds a homework task (e.g. read from Teams or a screenshot). Safe to call again for the same homework: it updates instead of duplicating. Homework due within 2 days goes straight into today's plan.",
    input: z.object({
      title: z.string().min(1),
      due_date: dateArg.describe("Due date, YYYY-MM-DD."),
      subject: subjectArg.optional().describe("Leave out for non-subject homework."),
      notes: z.string().optional().describe("Instructions or details."),
      minutes: z.number().int().min(5).max(600).optional().describe("Rough time it will take (default 30)."),
      source_id: z.string().optional().describe("Your own ID for this homework (e.g. the Teams assignment ID), to avoid duplicates."),
    }),
    async run(args, { sql, caller }) {
      const core = await loadCore();
      const subject = args.subject ? subjectOrFail(core, args.subject) : null;
      const externalId = args.source_id ? `${caller}:${args.source_id}` : null;
      const [existing] = externalId
        ? await sql<{ id: number }[]>`select id from homework where external_id = ${externalId}`
        : await sql<{ id: number }[]>`select id from homework where lower(title) = ${args.title.toLowerCase()}
                                      and due_date = ${args.due_date} and subject_id is not distinct from ${subject?.id ?? null}`;
      if (existing) {
        await sql`update homework set title = ${args.title}, due_date = ${args.due_date}, subject_id = ${subject?.id ?? null},
                  notes = coalesce(nullif(${args.notes ?? ""}, ''), notes), minutes = coalesce(${args.minutes ?? null}, minutes)
                  where id = ${existing.id}`;
      } else {
        await sql`insert into homework (subject_id, title, due_date, notes, minutes, source, external_id)
                  values (${subject?.id ?? null}, ${args.title}, ${args.due_date}, ${args.notes ?? ""}, ${args.minutes ?? 30},
                          ${caller}, ${externalId})`;
        if (daysBetween(core.today, args.due_date) <= 2) await clearTodaysPlan(sql);
      }
      return { saved: true, updated_existing: Boolean(existing), title: args.title, due: args.due_date, subject: subject?.name ?? "General" };
    },
  }),

  tool({
    name: "complete_homework",
    title: "Mark homework done",
    description: "Marks a homework task as done (e.g. once it's been handed in on Teams).",
    input: z.object({ title: z.string().min(1), due_date: dateArg.optional() }),
    async run({ title, due_date }, { sql }) {
      const wanted = normalise(title);
      const open = await sql<{ id: number; title: string; dueDate: string }[]>`
        select id, title, due_date from homework where not done order by due_date`;
      const match = open.find((h) => normalise(h.title) === wanted && (!due_date || h.dueDate === due_date))
        ?? open.find((h) => normalise(h.title).includes(wanted) && (!due_date || h.dueDate === due_date));
      if (!match) throw new ToolError(`No unfinished homework matches "${title}".`);
      await sql`update homework set done = true where id = ${match.id}`;
      return { done: true, title: match.title, due: match.dueDate };
    },
  }),

  tool({
    name: "add_test",
    title: "Add a test, mock or exam",
    description:
      "Adds a class test (or a mock/exam) with the topics it covers. Topics in an upcoming test get boosted in the daily plan as the test gets closer. Safe to call again: it updates instead of duplicating.",
    input: z.object({
      subject: subjectArg,
      date: dateArg.describe("Date of the test, YYYY-MM-DD."),
      title: z.string().optional().describe("e.g. 'Bonding end-of-topic test'."),
      topics: z.array(z.string()).optional().describe("Topics the test covers (names as in list_topics)."),
      kind: z.enum(["test", "mock", "final"]).optional().describe("Default 'test' (a class test)."),
      source_id: z.string().optional(),
    }),
    async run(args, { sql, caller }) {
      const core = await loadCore();
      const subject = subjectOrFail(core, args.subject);
      const kind = args.kind ?? "test";
      const title = args.title?.trim() || (kind === "test" ? `${subject.name} test` : kind === "mock" ? `${subject.name} mock` : `${subject.name} exam`);
      const topicIds: number[] = [];
      const notFound: { name: string; suggestions: string[] }[] = [];
      for (const name of args.topics ?? []) {
        const { topic, suggestions } = findTopic(topicsOf(core, subject), name);
        if (topic) topicIds.push(topic.id);
        else notFound.push({ name, suggestions });
      }
      const externalId = args.source_id ? `${caller}:${args.source_id}` : null;
      const [existing] = externalId
        ? await sql<{ id: number }[]>`select id from assessments where external_id = ${externalId}`
        : await sql<{ id: number }[]>`select id from assessments where subject_id = ${subject.id} and date = ${args.date}
                                      and lower(title) = ${title.toLowerCase()}`;
      if (existing) {
        await sql`update assessments set title = ${title}, date = ${args.date}, kind = ${kind}, topic_ids = ${topicIds}
                  where id = ${existing.id}`;
      } else {
        await sql`insert into assessments (subject_id, kind, title, date, topic_ids, source, external_id)
                  values (${subject.id}, ${kind}, ${title}, ${args.date}, ${topicIds}, ${caller}, ${externalId})`;
      }
      await clearTodaysPlan(sql);
      return {
        saved: true,
        updated_existing: Boolean(existing),
        subject: subject.name,
        title,
        date: args.date,
        topics: topicIds.map((id) => core.allTopics.find((t) => t.id === id)?.name),
        topics_not_found: notFound.length ? notFound : undefined,
      };
    },
  }),
];

export type AnyTool = (typeof TOOLS)[number];

/** Tool descriptions in JSON Schema form (for MCP and for GET /api/agent). */
export function toolList() {
  return TOOLS.map((t) => {
    const { $schema, ...inputSchema } = z.toJSONSchema(t.input, { io: "input" }) as Record<string, unknown>;
    void $schema;
    return {
      name: t.name,
      title: t.title,
      description: t.description,
      inputSchema,
      annotations: { title: t.title, readOnlyHint: Boolean(t.readOnly), destructiveHint: false, openWorldHint: false },
    };
  });
}

/** Checks the arguments and runs a tool. Throws ToolError with a helpful message on bad input. */
export async function runTool(name: string, rawArgs: unknown, ctx: ToolContext): Promise<unknown> {
  const t = TOOLS.find((x) => x.name === name);
  if (!t) throw new ToolError(`Unknown tool "${name}". Tools: ${TOOLS.map((x) => x.name).join(", ")}.`);
  const parsed = t.input.safeParse(rawArgs ?? {});
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; ");
    throw new ToolError(`Invalid arguments for ${name}: ${problems}`);
  }
  return (t.run as (args: unknown, ctx: ToolContext) => Promise<unknown>)(parsed.data, ctx);
}
