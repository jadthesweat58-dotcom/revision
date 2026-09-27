// Database connection (Supabase Postgres). On first use it creates the tables
// and fills in the starting subjects and topics.

import postgres from "postgres";
import { SCHEMA_SQL } from "./schema";
import { SEED_SUBJECTS } from "./seed-data";
import { DEFAULT_SETTINGS } from "./types";

export type Sql = postgres.Sql;

export const isPostgresAddress = (value: string | undefined) => Boolean(value && /^postgres(ql)?:\/\//.test(value));

/**
 * Finds the database address. Vercel's Supabase integration adds two:
 * POSTGRES_URL_NON_POOLING (a direct connection) and POSTGRES_URL (through
 * Supabase's connection sharer). The direct one is preferred: the sharer can
 * get stuck on queries that include values when used with this app's database
 * library. DATABASE_URL, if you set one yourself, always wins.
 */
export function databaseUrl(): string | null {
  const name = databaseSettingName();
  return name ? process.env[name]! : null;
}

function postgresSettingNames(): string[] {
  return Object.keys(process.env).filter((key) => isPostgresAddress(process.env[key]));
}

/** Which setting the database address was taken from (the name only, never the value). */
export function databaseSettingName(): string | null {
  const names = postgresSettingNames();
  if (names.includes("DATABASE_URL")) return "DATABASE_URL";
  const direct = names.filter((k) => k.includes("NON_POOLING")).sort((a, b) => a.length - b.length)[0];
  if (direct) return direct;
  if (names.includes("POSTGRES_URL")) return "POSTGRES_URL";
  return names.sort((a, b) => Number(a.includes("PRISMA")) - Number(b.includes("PRISMA")) || a.length - b.length)[0] ?? null;
}

/** A second database address (if there is one), used to rescue a jammed connection. */
export function backupSettingName(): string | null {
  const main = databaseSettingName();
  const others = postgresSettingNames().filter((k) => k !== main && process.env[k] !== process.env[main ?? ""]);
  return others.find((k) => k.includes("NON_POOLING")) ?? others.find((k) => k === "POSTGRES_URL") ?? others[0] ?? null;
}

/** Names (never values) of settings that look database-related, to help with setup problems. */
export function databaseSettingNames(): string[] {
  return Object.keys(process.env)
    .filter((k) => /POSTGRES|SUPABASE|DATABASE/i.test(k))
    .sort();
}

let client: Sql | null = null;
let ready: Promise<void> | null = null;

export function connect(url: string, maxConnections = 3): Sql {
  const parsed = new URL(url);
  const isLocal = ["localhost", "127.0.0.1"].includes(parsed.hostname);
  parsed.search = ""; // drop extras like ?sslmode=require&supa=... — set explicitly below
  return postgres(parsed.toString(), {
    ssl: isLocal ? false : "require",
    prepare: false, // needed for Supabase's connection pooler
    max: maxConnections,
    max_lifetime: 60 * 5, // recycle connections so none linger
    idle_timeout: 20,
    connect_timeout: 5, // fail quickly (with an error you can see) instead of hanging
    onnotice: () => {}, // hide "table already exists" notices
    transform: postgres.camel, // snake_case columns <-> camelCase in code
    types: {
      // Keep dates as plain "YYYY-MM-DD" strings instead of JavaScript Dates.
      date: { to: 1082, from: [1082], serialize: (x: string) => x, parse: (x: string) => x },
    },
  });
}

export async function db(): Promise<Sql> {
  if (!client) {
    const url = databaseUrl();
    if (!url) throw new Error("No database connected yet (DATABASE_URL / POSTGRES_URL is missing).");
    client = connect(url);
  }
  if (!ready) {
    ready = setUpWithRescue().catch((error) => {
      ready = null; // try again on the next request
      throw error;
    });
  }
  await ready;
  return client!;
}

/** Rejects if `promise` takes longer than `ms`, so nothing can hang forever. */
export function withTimeout<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(Object.assign(new Error(`${what} took longer than ${ms / 1000}s`), { code: "APP_TIMEOUT" })),
      ms,
    );
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Normal case: setup is already done and this takes a few milliseconds.
 * If the database doesn't answer, it's probably jammed by connections left
 * stuck by earlier cut-off requests. Clear them through Supabase's second
 * ("non-pooling") address, which has its own connections, then try again.
 */
async function setUpWithRescue() {
  try {
    await withTimeout(setUp(client!), 6_000, "Database setup");
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code !== "APP_TIMEOUT" && code !== "CONNECT_TIMEOUT") throw error;
    await rescueStuckConnections();
    client!.end({ timeout: 0 }).catch(() => {});
    client = connect(databaseUrl()!);
    await withTimeout(setUp(client, 10), 15_000, "Database setup (second try)");
  }
}

async function rescueStuckConnections() {
  const name = backupSettingName();
  if (!name) return;
  const backup = connect(process.env[name]!, 1);
  try {
    await withTimeout(clearStuckSessions(backup, 10), 3_000, "Clearing stuck connections");
  } catch {
    // Best effort: if this fails too, the second try below reports the problem.
  } finally {
    backup.end({ timeout: 0 }).catch(() => {});
  }
}

/** Bump this whenever SCHEMA_SQL or the starting subjects change, so the setup runs again. */
const SETUP_VERSION = 3;

async function setUp(sql: Sql, stuckAfterSeconds = 30) {
  if (await alreadySetUp(sql)) return; // the normal case: nothing to do, no waiting
  await clearStuckSessions(sql, stuckAfterSeconds);
  await sql.begin(async (tx) => {
    // Never wait forever: give up with an error rather than leaving a page hanging.
    await tx`set local lock_timeout = '15s'`;
    await tx`set local statement_timeout = '30s'`;
    await tx`set local idle_in_transaction_session_timeout = '30s'`;
    // Only one copy of the app sets up the database at a time.
    await tx`select pg_advisory_xact_lock(4242)`;
    await tx.unsafe(SCHEMA_SQL);
    await seed(tx);
    await tx`insert into settings (key, value) values ('setupVersion', ${tx.json(SETUP_VERSION)})
             on conflict (key) do update set value = excluded.value`;
  });
}

async function alreadySetUp(sql: Sql): Promise<boolean> {
  try {
    const [row] = await sql<{ value: number }[]>`select value from settings where key = 'setupVersion'`;
    return row?.value === SETUP_VERSION;
  } catch (error) {
    if ((error as { code?: string }).code === "42P01") return false; // tables don't exist yet
    throw error;
  }
}

/**
 * If an earlier request was cut off half-way (e.g. Vercel stopped it for taking too
 * long), it can leave a database session stuck, blocking or clogging everything
 * after it. This ends this app's own sessions that have been stuck mid-change,
 * waiting on a lock, or waiting on a vanished request for longer than
 * `seconds`. No saved data is touched.
 * (The query has no parameters on purpose, so it works through any connection.)
 */
export async function clearStuckSessions(sql: Sql, seconds: number) {
  const age = `interval '${Math.max(1, Math.round(seconds))} seconds'`;
  try {
    await sql.unsafe(`select pg_terminate_backend(pid) from pg_stat_activity
      where usename = current_user and pid <> pg_backend_pid()
        and ((state like 'idle in transaction%' and state_change < now() - ${age})
          or (wait_event_type = 'Lock' and query_start < now() - ${age})
          or (state = 'active' and wait_event = 'ClientRead' and query_start < now() - ${age}))`);
  } catch {
    // Not allowed on this database. The timeouts still stop pages hanging forever.
  }
}

/**
 * Adds any starting subject that isn't in the database yet (never overwrites your edits).
 * Rows are inserted in batches so the first setup takes a couple of seconds, not a minute.
 */
async function seed(sql: postgres.TransactionSql) {
  const existing = await sql<{ slug: string }[]>`select slug from subjects`;
  const have = new Set(existing.map((row) => row.slug));

  for (const [index, subject] of SEED_SUBJECTS.entries()) {
    if (have.has(subject.slug)) continue;
    const [{ id }] = await sql<{ id: number }[]>`
      insert into subjects (slug, name, board, spec_code, kind, target_grade, stretch_grade,
                            boundaries, boundary_max, sort_order)
      values (${subject.slug}, ${subject.name}, ${subject.board}, ${subject.specCode}, ${subject.kind},
              ${subject.targetGrade}, ${subject.stretchGrade ?? null}, ${sql.json(subject.boundaries)},
              ${subject.boundaryMax}, ${index})
      returning id`;

    const topics = subject.topics.map((topic, order) => ({
      subjectId: id,
      name: topic.name,
      groupName: topic.group,
      paper: topic.paper,
      weight: topic.weight,
      isSetText: topic.setText ?? false,
      sortOrder: order,
    }));
    await sql`insert into topics ${sql(topics)}`;

    const assessments = subject.assessments.map((a) => ({ subjectId: id, kind: a.kind, title: a.title, date: a.date, tbc: a.tbc }));
    if (assessments.length) await sql`insert into assessments ${sql(assessments)}`;
  }

  const settings = Object.entries(DEFAULT_SETTINGS).map(([key, value]) => ({ key, value: sql.json(value) }));
  await sql`insert into settings ${sql(settings)} on conflict (key) do nothing`;
}
