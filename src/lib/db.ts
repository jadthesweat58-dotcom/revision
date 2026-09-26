// Database connection (Supabase Postgres). On first use it creates the tables
// and fills in the starting subjects and topics.

import postgres from "postgres";
import { SCHEMA_SQL } from "./schema";
import { SEED_SUBJECTS } from "./seed-data";
import { DEFAULT_SETTINGS } from "./types";

export type Sql = postgres.Sql;

const isPostgresAddress = (value: string | undefined) => Boolean(value && /^postgres(ql)?:\/\//.test(value));

/**
 * Finds the database address. Vercel's Supabase integration adds POSTGRES_URL,
 * sometimes with a prefix (e.g. STORAGE_POSTGRES_URL); DATABASE_URL also works.
 * As a fallback, any setting holding a postgres:// address is used, preferring
 * the pooled one (what serverless apps like this should use).
 */
export function databaseUrl(): string | null {
  const name = databaseSettingName();
  return name ? process.env[name]! : null;
}

/** Which setting the database address was taken from (the name only, never the value). */
export function databaseSettingName(): string | null {
  const env = process.env;
  if (isPostgresAddress(env.DATABASE_URL)) return "DATABASE_URL";
  if (isPostgresAddress(env.POSTGRES_URL)) return "POSTGRES_URL";
  const candidates = Object.keys(env)
    .filter((key) => isPostgresAddress(env[key]))
    .sort((a, b) => Number(a.includes("NON_POOLING")) - Number(b.includes("NON_POOLING")) || a.length - b.length);
  return candidates[0] ?? null;
}

/** Names (never values) of settings that look database-related, to help with setup problems. */
export function databaseSettingNames(): string[] {
  return Object.keys(process.env)
    .filter((k) => /POSTGRES|SUPABASE|DATABASE/i.test(k))
    .sort();
}

let client: Sql | null = null;
let ready: Promise<void> | null = null;

function connect(url: string, maxConnections = 5): Sql {
  const parsed = new URL(url);
  const isLocal = ["localhost", "127.0.0.1"].includes(parsed.hostname);
  parsed.search = ""; // drop extras like ?sslmode=require&supa=... — set explicitly below
  return postgres(parsed.toString(), {
    ssl: isLocal ? false : "require",
    prepare: false, // needed for Supabase's connection pooler
    max: maxConnections,
    idle_timeout: 20,
    connect_timeout: 10, // fail quickly (with an error you can see) instead of hanging
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
function withTimeout<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
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
    await withTimeout(setUp(client!), 12_000, "Database setup");
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code !== "APP_TIMEOUT" && code !== "CONNECT_TIMEOUT") throw error;
    await rescueStuckConnections();
    client!.end({ timeout: 0 }).catch(() => {});
    client = connect(databaseUrl()!);
    await withTimeout(setUp(client, "10 seconds"), 15_000, "Database setup (second try)");
  }
}

async function rescueStuckConnections() {
  const name = Object.keys(process.env).find((k) => k.includes("NON_POOLING") && isPostgresAddress(process.env[k]));
  if (!name) return;
  const backup = connect(process.env[name]!, 1);
  try {
    await withTimeout(clearStuckSessions(backup, "10 seconds"), 10_000, "Clearing stuck connections");
  } catch {
    // Best effort: if this fails too, the second try below reports the problem.
  } finally {
    backup.end({ timeout: 0 }).catch(() => {});
  }
}

/** Bump this whenever SCHEMA_SQL or the starting subjects change, so the setup runs again. */
const SETUP_VERSION = 1;

async function setUp(sql: Sql, stuckAfter = "30 seconds") {
  if (await alreadySetUp(sql)) return; // the normal case: nothing to do, no waiting
  await clearStuckSessions(sql, stuckAfter);
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
 * long), it can leave a database session stuck mid-change, blocking everything
 * after it. This ends this app's own sessions that are stuck, or have been waiting
 * on a lock, for longer than `age`. No saved data is touched.
 */
async function clearStuckSessions(sql: Sql, age: string) {
  try {
    await sql`select pg_terminate_backend(pid) from pg_stat_activity
              where usename = current_user and pid <> pg_backend_pid()
                and ((state like 'idle in transaction%' and state_change < now() - ${age}::interval)
                  or (wait_event_type = 'Lock' and query_start < now() - ${age}::interval))`;
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
