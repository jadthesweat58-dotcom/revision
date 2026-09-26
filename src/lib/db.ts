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

function connect(url: string): Sql {
  const parsed = new URL(url);
  const isLocal = ["localhost", "127.0.0.1"].includes(parsed.hostname);
  parsed.search = ""; // drop extras like ?sslmode=require&supa=... — set explicitly below
  return postgres(parsed.toString(), {
    ssl: isLocal ? false : "require",
    prepare: false, // needed for Supabase's connection pooler
    max: 5,
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
    ready = setUp(client).catch((error) => {
      ready = null; // try again on the next request
      throw error;
    });
  }
  await ready;
  return client;
}

/** Bump this whenever SCHEMA_SQL or the starting subjects change, so the setup runs again. */
const SETUP_VERSION = 1;

async function setUp(sql: Sql) {
  if (await alreadySetUp(sql)) return; // the normal case: nothing to do, no waiting
  await clearStuckSetups(sql);
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
 * If an earlier setup was cut off half-way (e.g. Vercel stopped the page for taking
 * too long), its unfinished work can block every new attempt. This ends any of this
 * app's own database sessions that have been stuck mid-change for over 30 seconds.
 */
async function clearStuckSetups(sql: Sql) {
  try {
    await sql`select pg_terminate_backend(pid) from pg_stat_activity
              where usename = current_user and pid <> pg_backend_pid()
                and state like 'idle in transaction%'
                and state_change < now() - interval '30 seconds'`;
  } catch {
    // Not allowed on this database. The timeouts above still stop it hanging.
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
