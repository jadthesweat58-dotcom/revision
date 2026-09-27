"use server";

// Everything that saves data. Each function is called by a form in the app.

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { TIME_ZONES } from "@/lib/dates";
import { userToday } from "@/lib/data";
import { syncTeams } from "@/lib/teams";
import { createApiKey } from "@/lib/agent/auth";
import { revokeAllClaude } from "@/lib/agent/oauth";
import { clearTodaysPlan, rateTopic } from "@/lib/mutations";
import { SESSION_COOKIE, SESSION_DAYS, checkPassword, createSessionToken, isValidSessionToken } from "@/lib/auth";
import type { Sql } from "@/lib/db";
import type { Status } from "@/lib/types";

// ---------- Small helpers ----------

async function requireLogin() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!isValidSessionToken(token)) redirect("/login");
}

const text = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();
const number = (fd: FormData, key: string) => {
  const value = Number(fd.get(key));
  return Number.isFinite(value) ? value : 0;
};
const optionalId = (fd: FormData, key: string) => {
  const value = Number(fd.get(key));
  return value > 0 ? value : null;
};
const ids = (fd: FormData, key: string) => fd.getAll(key).map(Number).filter((n) => n > 0);
const isStatus = (s: string): s is Status => ["red", "amber", "green", "unrated"].includes(s);
const dateOrToday = async (sql: Sql, fd: FormData, key: string) => text(fd, key) || (await userToday(sql));

/** Only allow going back to a page inside this app (never another website). */
const isLocalPath = (path: string) => path.startsWith("/") && !path.startsWith("//") && !path.includes("\\");

/** Refresh every page and go back to where the form was. */
function done(fd: FormData, fallback = "/"): never {
  revalidatePath("/", "layout");
  const back = text(fd, "back");
  redirect(isLocalPath(back) ? back : fallback);
}

// ---------- Login ----------

export async function login(_prev: string | null, fd: FormData): Promise<string | null> {
  if (!process.env.APP_PASSWORD) return "No password has been set up yet. Add APP_PASSWORD in Vercel (see SETUP.md).";
  if (!checkPassword(text(fd, "password"))) {
    await new Promise((r) => setTimeout(r, 1000)); // slows down guessing
    return "That password isn't right.";
  }
  (await cookies()).set(SESSION_COOKIE, createSessionToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 86_400,
  });
  const next = text(fd, "next");
  redirect(isLocalPath(next) ? next : "/");
}

export async function logout() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}

// ---------- Topics ----------

export async function setTopicStatus(fd: FormData) {
  await requireLogin();
  const status = text(fd, "status");
  if (isStatus(status)) await rateTopic(await db(), number(fd, "topicId"), status);
  done(fd);
}

export async function addTopic(fd: FormData) {
  await requireLogin();
  const sql = await db();
  const name = text(fd, "name");
  if (name) {
    await sql`insert into topics (subject_id, name, group_name, weight, source, sort_order)
              values (${number(fd, "subjectId")}, ${name}, ${text(fd, "group") || "My topics"},
                      ${number(fd, "weight") || 5}, 'manual', 1000)`;
  }
  done(fd);
}

export async function updateTopic(fd: FormData) {
  await requireLogin();
  const sql = await db();
  const name = text(fd, "name");
  if (name) {
    await sql`update topics set name = ${name}, group_name = ${text(fd, "group")},
              weight = ${Math.max(number(fd, "weight"), 0.1)} where id = ${number(fd, "topicId")}`;
  }
  done(fd);
}

export async function setTopicArchived(fd: FormData) {
  await requireLogin();
  const sql = await db();
  await sql`update topics set archived = ${text(fd, "archived") === "true"} where id = ${number(fd, "topicId")}`;
  await clearTodaysPlan(sql);
  done(fd);
}

// ---------- Study sessions ----------

export async function logSession(fd: FormData) {
  await requireLogin();
  const sql = await db();
  const subjectId = number(fd, "subjectId");
  const minutes = Math.round(number(fd, "minutes"));
  const topicIds = ids(fd, "topicIds");
  const date = await dateOrToday(sql, fd, "date");
  if (!subjectId || minutes <= 0) done(fd, "/log");

  const [{ id }] = await sql<{ id: number }[]>`
    insert into sessions (subject_id, date, minutes, topic_ids, went_well, struggles)
    values (${subjectId}, ${date}, ${minutes}, ${topicIds}, ${text(fd, "wentWell")}, ${text(fd, "struggles")})
    returning id`;

  for (const topicId of topicIds) {
    const status = text(fd, `status_${topicId}`);
    if (isStatus(status) && status !== "unrated") await rateTopic(sql, topicId, status, id);
  }
  for (const errorType of fd.getAll("errorTypes").map(String).filter(Boolean)) {
    await sql`insert into mistakes (subject_id, topic_id, error_type, date)
              values (${subjectId}, ${topicIds.length === 1 ? topicIds[0] : null}, ${errorType}, ${date})`;
  }
  done(fd);
}

export async function deleteSession(fd: FormData) {
  await requireLogin();
  const sql = await db();
  await sql`delete from sessions where id = ${number(fd, "id")}`;
  done(fd);
}

// ---------- Scores ----------

export async function logScore(fd: FormData) {
  await requireLogin();
  const sql = await db();
  const max = number(fd, "maxScore");
  if (max > 0) {
    // English: optional per-AO marks, sent as ao_AO1_score / ao_AO1_max etc.
    const aoScores: Record<string, { score: number; max: number }> = {};
    for (const [key, value] of fd.entries()) {
      const match = /^ao_(AO\d)_score$/.exec(key);
      const aoMax = match ? number(fd, `ao_${match[1]}_max`) : 0;
      if (match && String(value) !== "" && aoMax > 0) aoScores[match[1]] = { score: Number(value), max: aoMax };
    }
    await sql`
      insert into paper_scores (subject_id, topic_id, paper, score, max_score, date, kind, ao_scores, notes)
      values (${number(fd, "subjectId")}, ${optionalId(fd, "topicId")}, ${text(fd, "paper")},
              ${number(fd, "score")}, ${max}, ${await dateOrToday(sql, fd, "date")}, ${text(fd, "kind") || "past paper"},
              ${Object.keys(aoScores).length ? sql.json(aoScores) : null}, ${text(fd, "notes")})`;
  }
  done(fd);
}

export async function deleteScore(fd: FormData) {
  await requireLogin();
  const sql = await db();
  await sql`delete from paper_scores where id = ${number(fd, "id")}`;
  done(fd);
}

export async function updateBoundaries(fd: FormData) {
  await requireLogin();
  const sql = await db();
  const boundaries: Record<string, number> = {};
  for (let grade = 1; grade <= 9; grade++) {
    const value = text(fd, `grade_${grade}`);
    if (value !== "" && Number(value) > 0) boundaries[String(grade)] = Number(value);
  }
  const max = number(fd, "boundaryMax");
  if (max > 0) {
    await sql`update subjects set boundaries = ${sql.json(boundaries)}, boundary_max = ${max}
              where id = ${number(fd, "subjectId")}`;
  }
  done(fd);
}

// ---------- Mistakes ----------

export async function logMistake(fd: FormData) {
  await requireLogin();
  const sql = await db();
  const errorType = text(fd, "customErrorType") || text(fd, "errorType");
  if (errorType) {
    await sql`insert into mistakes (subject_id, topic_id, error_type, note, date)
              values (${number(fd, "subjectId")}, ${optionalId(fd, "topicId")}, ${errorType},
                      ${text(fd, "note")}, ${await dateOrToday(sql, fd, "date")})`;
  }
  done(fd);
}

export async function deleteMistake(fd: FormData) {
  await requireLogin();
  const sql = await db();
  await sql`delete from mistakes where id = ${number(fd, "id")}`;
  done(fd);
}

// ---------- Homework, tests and exams ----------

export async function addHomework(fd: FormData) {
  await requireLogin();
  const sql = await db();
  const title = text(fd, "title");
  if (title && text(fd, "dueDate")) {
    await sql`insert into homework (subject_id, title, due_date, notes, minutes)
              values (${optionalId(fd, "subjectId")}, ${title}, ${text(fd, "dueDate")}, ${text(fd, "notes")},
                      ${number(fd, "minutes") || 30})`;
    await clearTodaysPlan(sql);
  }
  done(fd);
}

export async function setHomeworkDone(fd: FormData) {
  await requireLogin();
  const sql = await db();
  await sql`update homework set done = ${text(fd, "done") === "true"} where id = ${number(fd, "id")}`;
  done(fd);
}

export async function deleteHomework(fd: FormData) {
  await requireLogin();
  const sql = await db();
  await sql`delete from homework where id = ${number(fd, "id")}`;
  await clearTodaysPlan(sql);
  done(fd);
}

export async function addAssessment(fd: FormData) {
  await requireLogin();
  const sql = await db();
  const kind = text(fd, "kind");
  const date = text(fd, "date");
  if (["mock", "final", "test"].includes(kind) && date) {
    const title = text(fd, "title") || (kind === "test" ? "Class test" : kind === "mock" ? "Mock" : "Exam");
    await sql`insert into assessments (subject_id, kind, title, date, tbc, topic_ids, notes)
              values (${number(fd, "subjectId")}, ${kind}, ${title}, ${date}, ${text(fd, "tbc") === "on"},
                      ${ids(fd, "topicIds")}, ${text(fd, "notes")})`;
    await clearTodaysPlan(sql);
  }
  done(fd);
}

export async function updateAssessment(fd: FormData) {
  await requireLogin();
  const sql = await db();
  const date = text(fd, "date");
  if (date) {
    await sql`update assessments set title = ${text(fd, "title")}, date = ${date}, tbc = ${text(fd, "tbc") === "on"}
              where id = ${number(fd, "id")}`;
    await clearTodaysPlan(sql);
  }
  done(fd);
}

export async function deleteAssessment(fd: FormData) {
  await requireLogin();
  const sql = await db();
  await sql`delete from assessments where id = ${number(fd, "id")}`;
  await clearTodaysPlan(sql);
  done(fd);
}

// ---------- English Literature: quotes, themes, characters ----------

export async function addQuote(fd: FormData) {
  await requireLogin();
  const sql = await db();
  const quote = text(fd, "text");
  if (quote) {
    await sql`insert into quotes (topic_id, text, theme, character)
              values (${number(fd, "topicId")}, ${quote}, ${text(fd, "theme")}, ${text(fd, "character")})`;
  }
  done(fd);
}

export async function deleteQuote(fd: FormData) {
  await requireLogin();
  const sql = await db();
  await sql`delete from quotes where id = ${number(fd, "id")}`;
  done(fd);
}

/** Called by the quote quiz after each answer. */
export async function recordQuizAnswer(quoteId: number, correct: boolean) {
  await requireLogin();
  const sql = await db();
  await sql`update quotes set times_quizzed = times_quizzed + 1,
            times_correct = times_correct + ${correct ? 1 : 0} where id = ${quoteId}`;
}

export async function addTextNote(fd: FormData) {
  await requireLogin();
  const sql = await db();
  const kind = text(fd, "kind");
  const name = text(fd, "name");
  if (name && (kind === "theme" || kind === "character")) {
    await sql`insert into text_notes (topic_id, kind, name, notes)
              values (${number(fd, "topicId")}, ${kind}, ${name}, ${text(fd, "notes")})`;
  }
  done(fd);
}

export async function deleteTextNote(fd: FormData) {
  await requireLogin();
  const sql = await db();
  await sql`delete from text_notes where id = ${number(fd, "id")}`;
  done(fd);
}

// ---------- Microsoft Teams ----------

export async function syncTeamsNow(fd: FormData) {
  await requireLogin();
  try {
    await syncTeams(await db());
  } catch {
    // The problem is saved and shown on the Homework & tests page.
  }
  done(fd, "/coming-up");
}

export async function disconnectTeams(fd: FormData) {
  await requireLogin();
  const sql = await db();
  await sql`delete from integrations where provider = 'teams'`;
  done(fd, "/coming-up");
}

/** Your choice of subject for each Teams class (also fixes homework already synced). */
export async function saveClassSubjects(fd: FormData) {
  await requireLogin();
  const sql = await db();
  for (const [key, value] of fd.entries()) {
    const match = /^class_(.+)$/.exec(key);
    if (!match) continue;
    const subjectId = Number(value) > 0 ? Number(value) : null;
    await sql`update teams_classes set subject_id = ${subjectId} where class_id = ${match[1]}`;
    await sql`update homework set subject_id = ${subjectId}
              where source = 'teams' and class_name = (select name from teams_classes where class_id = ${match[1]})`;
  }
  await clearTodaysPlan(sql);
  done(fd, "/coming-up");
}

// ---------- Connector (Claude chats and Jarvis) ----------

/** Makes a new key for Jarvis. The key is shown once, then only its hash is kept. */
export async function createConnectorKey(
  _prev: { key?: string; name?: string; error?: string } | null,
  fd: FormData,
): Promise<{ key?: string; name?: string; error?: string }> {
  await requireLogin();
  const name = text(fd, "name").slice(0, 40);
  if (!name) return { error: "Give the key a name, e.g. Jarvis." };
  const key = await createApiKey(await db(), name);
  revalidatePath("/settings");
  return { key, name };
}

export async function revokeConnectorKey(fd: FormData) {
  await requireLogin();
  const sql = await db();
  await sql`update api_keys set revoked = true where id = ${number(fd, "id")}`;
  done(fd, "/settings");
}

export async function disconnectClaude(fd: FormData) {
  await requireLogin();
  await revokeAllClaude(await db());
  done(fd, "/settings");
}

// ---------- Settings and plan ----------

export async function updateSettings(fd: FormData) {
  await requireLogin();
  const sql = await db();
  const timeZone = text(fd, "timeZone");
  if (TIME_ZONES.some((z) => z.id === timeZone)) {
    await sql`insert into settings (key, value) values ('timeZone', ${sql.json(timeZone)})
              on conflict (key) do update set value = excluded.value`;
  }
  for (const key of ["normalHoursMin", "normalHoursMax", "heavyHoursMin", "heavyHoursMax", "heavyWeeksBefore"]) {
    const value = number(fd, key);
    if (value > 0) {
      await sql`insert into settings (key, value) values (${key}, ${sql.json(value)})
                on conflict (key) do update set value = excluded.value`;
    }
  }
  await clearTodaysPlan(sql);
  done(fd);
}

export async function updateSubject(fd: FormData) {
  await requireLogin();
  const sql = await db();
  const target = number(fd, "targetGrade");
  const stretch = number(fd, "stretchGrade");
  if (target >= 1 && target <= 9) {
    await sql`update subjects set target_grade = ${target},
              stretch_grade = ${stretch > target && stretch <= 9 ? stretch : null},
              spec_code = ${text(fd, "specCode")}, board = ${text(fd, "board")}
              where id = ${number(fd, "subjectId")}`;
  }
  done(fd);
}

export async function rebuildPlan(fd: FormData) {
  await requireLogin();
  await clearTodaysPlan(await db());
  done(fd);
}
