// Microsoft Teams connection. Reads your Teams assignments (title, class, due
// date, instructions) through Microsoft Graph and adds them to Homework & tests.
//
// Needs MS_CLIENT_ID and MS_CLIENT_SECRET from your Microsoft app registration
// (see TEAMS_SETUP.md). It only ever reads; it never changes anything in Teams.

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import type postgres from "postgres";
import type { Sql } from "./db";
import { addDays, todayISO } from "./dates";
import { settingsFrom } from "./data";
import { appOrigin } from "./origin";

// These two can be pointed at a fake Microsoft server for testing. Normally unset.
const LOGIN_BASE = process.env.MS_LOGIN_BASE ?? "https://login.microsoftonline.com/organizations/oauth2/v2.0";
const GRAPH_BASE = process.env.MS_GRAPH_BASE ?? "https://graph.microsoft.com/v1.0";

/** Read-only permissions: your profile name, your assignments, and your class names. */
export const TEAMS_SCOPES = "offline_access User.Read EduAssignments.ReadBasic EduRoster.ReadBasic";

export function teamsConfigured(): boolean {
  return Boolean(process.env.MS_CLIENT_ID && process.env.MS_CLIENT_SECRET);
}

// ---------- Problems, explained ----------

export type TeamsProblem = "admin_approval" | "cancelled" | "reconnect" | "not_available" | "other";

export class TeamsError extends Error {
  constructor(
    public problem: TeamsProblem,
    detail = "",
  ) {
    super(detail || problem);
  }
}

/** Turns Microsoft's error codes into one of a few plain situations. */
export function classifyMicrosoftError(error = "", description = ""): TeamsProblem {
  const text = `${error} ${description}`;
  // Admin approval needed, or blocked by the school's sign-in rules.
  if (/AADSTS(90094|90095|900941|50105|53003|530003)\b/.test(text) || /admin (approval|consent)/i.test(text)) {
    return "admin_approval";
  }
  if (error === "access_denied" || error === "consent_required" || /AADSTS65004\b/.test(text)) return "cancelled";
  if (error === "invalid_grant" || error === "interaction_required" || /AADSTS(700082|50173|70000|70008|50076)\b/.test(text)) {
    return "reconnect";
  }
  return "other";
}

export const PROBLEM_TEXT: Record<TeamsProblem, string> = {
  admin_approval:
    "Your school needs an IT admin to approve this app before it can read your Teams. That's the school's decision, and the app won't try to get round it. Keep adding homework and tests here by hand (or, once the Claude connector is built, send Claude a screenshot).",
  cancelled:
    "Microsoft didn't give the app access. If you saw a \"Need admin approval\" screen, your school blocks outside apps (keep adding homework by hand). Otherwise tap Connect Teams again and choose Accept.",
  reconnect: "The Teams connection has expired or was removed. Tap Connect Teams to sign in again.",
  not_available:
    "Microsoft said your school account isn't allowed to share assignments with apps. Keep adding homework by hand.",
  other: "Something went wrong talking to Microsoft.",
};

// ---------- Keeping the sign-in safe ----------

// The saved sign-in (refresh token) is encrypted, so the database alone can't be used to read your Teams.
function encryptionKey(): Buffer {
  return createHash("sha256")
    .update(`teams-token:${process.env.MS_CLIENT_SECRET ?? ""}:${process.env.APP_PASSWORD ?? ""}`)
    .digest();
}

export function encrypt(text: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const data = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString("base64url")).join(".");
}

export function decrypt(payload: string): string | null {
  try {
    const [iv, tag, data] = payload.split(".").map((part) => Buffer.from(part, "base64url"));
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

// ---------- Microsoft sign-in ----------

export function authorizeUrl(redirectUri: string, state: string, verifier: string): string {
  const params = new URLSearchParams({
    client_id: process.env.MS_CLIENT_ID!,
    response_type: "code",
    redirect_uri: redirectUri,
    response_mode: "query",
    scope: TEAMS_SCOPES,
    state,
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256",
    prompt: "select_account",
  });
  return `${LOGIN_BASE}/authorize?${params}`;
}

interface Tokens {
  access_token: string;
  refresh_token?: string;
}

async function tokenRequest(body: Record<string, string>): Promise<Tokens> {
  const response = await fetch(`${LOGIN_BASE}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.MS_CLIENT_ID!,
      client_secret: process.env.MS_CLIENT_SECRET!,
      scope: TEAMS_SCOPES,
      ...body,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok || json.error) {
    throw new TeamsError(classifyMicrosoftError(json.error, json.error_description), firstLine(json.error_description));
  }
  return json as Tokens;
}

export function exchangeCode(code: string, redirectUri: string, verifier: string) {
  return tokenRequest({ grant_type: "authorization_code", code, redirect_uri: redirectUri, code_verifier: verifier });
}

function firstLine(text: unknown): string {
  return String(text ?? "").split(/\r?\n/)[0].slice(0, 300);
}

// ---------- Microsoft Graph ----------

async function graphFetch(token: string, url: string) {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (response.status === 401) throw new TeamsError("reconnect");
  if (response.status === 403) throw new TeamsError("not_available");
  if (!response.ok) throw new TeamsError("other", `Microsoft Graph answered ${response.status}`);
  return response.json();
}

async function graphList<T>(token: string, path: string): Promise<T[]> {
  const items: T[] = [];
  let url: string | undefined = `${GRAPH_BASE}${path}`;
  for (let page = 0; url && page < 20; page++) {
    const json = await graphFetch(token, url);
    items.push(...(json.value ?? []));
    url = json["@odata.nextLink"];
  }
  return items;
}

export async function whoAmI(token: string): Promise<string> {
  const me = await graphFetch(token, `${GRAPH_BASE}/me?$select=displayName,userPrincipalName`);
  return me.displayName || me.userPrincipalName || "your school account";
}

// ---------- Saved connection ----------

export interface TeamsConnection {
  refreshToken?: string; // encrypted
  account?: string;
  connectedAt?: string;
  lastSync?: string;
  lastResult?: string;
  lastProblem?: TeamsProblem | null;
  lastProblemDetail?: string;
}

export async function loadTeams(sql: Sql): Promise<TeamsConnection | null> {
  const [row] = await sql<{ data: TeamsConnection }[]>`select data from integrations where provider = 'teams'`;
  return row?.data ?? null;
}

export async function saveTeams(sql: Sql, changes: TeamsConnection) {
  const current = (await loadTeams(sql)) ?? {};
  const data = { ...current, ...changes } as unknown as postgres.JSONValue;
  await sql`insert into integrations (provider, data, updated_at) values ('teams', ${sql.json(data)}, now())
            on conflict (provider) do update set data = excluded.data, updated_at = now()`;
}

export async function recordProblem(sql: Sql, problem: TeamsProblem, detail = "") {
  await saveTeams(sql, { lastProblem: problem, lastProblemDetail: detail });
}

// ---------- Matching classes to subjects ----------

/** Guesses the subject from a Teams class name, e.g. "10B Geography" -> geography. */
export function guessSubjectSlug(className: string): string | null {
  const name = className.toLowerCase();
  if (/physical education|\bpe\b/.test(name)) return null;
  if (/lit/.test(name)) return "english-literature";
  if (/lang/.test(name)) return "english-language";
  if (/math/.test(name)) return "maths";
  if (/bio/.test(name)) return "biology";
  if (/chem/.test(name)) return "chemistry";
  if (/phys/.test(name)) return "physics";
  if (/econ/.test(name)) return "economics";
  if (/business|\bbus\b|\bbst\b/.test(name)) return "business";
  if (/geog|\bgeo\b/.test(name)) return "geography";
  return null;
}

const ENTITIES: Record<string, string> = {
  nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'",
  ndash: "–", mdash: "—", lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”", hellip: "…",
};

/** Teams instructions are HTML; keep plain text only. */
export function plainText(html: string, max = 600): string {
  return html
    .replace(/<br\s*\/?>|<\/p>|<\/li>|<\/div>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&(nbsp|amp|lt|gt|quot|apos|ndash|mdash|lsquo|rsquo|ldquo|rdquo|hellip);/g, (_, name) => ENTITIES[name])
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim()
    .slice(0, max);
}

const LOOKS_LIKE_A_TEST = /\b(test|quiz|exam|assessment|mock)\b/i;

// ---------- Sync ----------

interface GraphClass {
  id: string;
  displayName: string;
}

interface GraphAssignment {
  id: string;
  classId: string;
  displayName: string;
  dueDateTime?: string | null;
  status?: string;
  webUrl?: string;
  instructions?: { content?: string } | null;
}

export interface SyncResult {
  assignments: number;
  added: number;
  updated: number;
  tests: number;
  unmatchedClasses: string[];
}

/**
 * Reads your classes and assignments from Teams and adds them as homework.
 * Homework you've marked done stays done. Returns null if Teams isn't connected.
 */
export async function syncTeams(sql: Sql, accessToken?: string): Promise<SyncResult | null> {
  if (!teamsConfigured()) return null;
  const connection = await loadTeams(sql);
  if (!connection?.refreshToken) return null;

  try {
    let token = accessToken;
    if (!token) {
      const refreshToken = decrypt(connection.refreshToken);
      if (!refreshToken) throw new TeamsError("reconnect");
      const tokens = await tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken });
      token = tokens.access_token;
      if (tokens.refresh_token) await saveTeams(sql, { refreshToken: encrypt(tokens.refresh_token) });
    }

    const settingRows = await sql<{ key: string; value: string }[]>`select key, value from settings where key = 'timeZone'`;
    const timeZone = settingsFrom(settingRows).timeZone;
    const today = todayISO(new Date(), timeZone);

    // 1. Classes, each matched to a subject (your own choices are never overwritten).
    const classes = await graphList<GraphClass>(token, "/education/me/classes");
    const subjects = await sql<{ id: number; slug: string }[]>`select id, slug from subjects`;
    for (const c of classes) {
      const guess = subjects.find((s) => s.slug === guessSubjectSlug(c.displayName))?.id ?? null;
      await sql`insert into teams_classes (class_id, name, subject_id) values (${c.id}, ${c.displayName}, ${guess})
                on conflict (class_id) do update set name = excluded.name`;
    }
    const classRows = await sql<{ classId: string; name: string; subjectId: number | null }[]>`
      select class_id, name, subject_id from teams_classes`;
    const classById = new Map(classRows.map((c) => [c.classId, c]));

    // 2. Assignments due from two weeks ago onwards.
    const assignments = await graphList<GraphAssignment>(token, "/education/me/assignments");
    const result: SyncResult = { assignments: 0, added: 0, updated: 0, tests: 0, unmatchedClasses: [] };
    for (const a of assignments) {
      if (!a.dueDateTime || a.status === "draft") continue;
      const dueDate = todayISO(new Date(a.dueDateTime), timeZone);
      if (dueDate < addDays(today, -14)) continue;
      const cls = classById.get(a.classId);
      const subjectId = cls?.subjectId ?? null;
      const notes = plainText(a.instructions?.content ?? "");
      result.assignments++;

      const [row] = await sql<{ inserted: boolean }[]>`
        insert into homework (subject_id, title, due_date, notes, source, external_id, class_name, link)
        values (${subjectId}, ${a.displayName}, ${dueDate}, ${notes}, 'teams', ${"teams:" + a.id},
                ${cls?.name ?? ""}, ${a.webUrl ?? ""})
        on conflict (external_id) do update set
          subject_id = excluded.subject_id, title = excluded.title, due_date = excluded.due_date,
          notes = excluded.notes, class_name = excluded.class_name, link = excluded.link
        returning (xmax = 0) as inserted`;
      if (row.inserted) result.added++;
      else result.updated++;

      // Assignments called "... test" / "quiz" also count as a test for that subject.
      if (subjectId && LOOKS_LIKE_A_TEST.test(a.displayName) && dueDate >= today) {
        await sql`
          insert into assessments (subject_id, kind, title, date, source, external_id)
          values (${subjectId}, 'test', ${a.displayName}, ${dueDate}, 'teams', ${"teams:" + a.id})
          on conflict (external_id) do update set subject_id = excluded.subject_id, title = excluded.title,
            date = excluded.date`;
        result.tests++;
      }
    }
    result.unmatchedClasses = classRows.filter((c) => c.subjectId === null).map((c) => c.name);

    const summary = `${result.assignments} assignments (${result.added} new)`;
    await saveTeams(sql, { lastSync: new Date().toISOString(), lastResult: summary, lastProblem: null, lastProblemDetail: "" });
    if (result.added > 0) await sql`delete from daily_plans where date = ${today}`; // rebuild with the new homework
    return result;
  } catch (error) {
    const problem = error instanceof TeamsError ? error.problem : "other";
    const detail = error instanceof TeamsError ? error.message : String((error as Error)?.message ?? error).slice(0, 300);
    await saveTeams(sql, { lastSync: new Date().toISOString(), lastProblem: problem, lastProblemDetail: detail });
    throw error;
  }
}

// ---------- Web addresses ----------

export const OAUTH_COOKIE = "teams_oauth";

export { appOrigin } from "./origin";

/** Microsoft only sends you back to the exact address registered, so always use the main one. */
export function callbackUrl(requestUrl: string): string {
  return `${appOrigin(requestUrl)}/api/teams/callback`;
}
