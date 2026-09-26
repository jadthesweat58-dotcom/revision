// Database connection (Supabase Postgres). On first use it creates the tables
// and fills in the starting subjects and topics.

import postgres from "postgres";
import { SCHEMA_SQL } from "./schema";
import { SEED_SUBJECTS } from "./seed-data";
import { DEFAULT_SETTINGS } from "./types";

export type Sql = postgres.Sql;

/**
 * Finds the database address. Vercel's Supabase integration adds POSTGRES_URL
 * (sometimes with a prefix, e.g. STORAGE_POSTGRES_URL); DATABASE_URL also works.
 */
export function databaseUrl(): string | null {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  if (process.env.POSTGRES_URL) return process.env.POSTGRES_URL;
  const key = Object.keys(process.env).find((k) => k.endsWith("_POSTGRES_URL"));
  return key ? process.env[key]! : null;
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

async function setUp(sql: Sql) {
  await sql.begin(async (tx) => {
    // Only one copy of the app sets up the database at a time.
    await tx`select pg_advisory_xact_lock(4242)`;
    await tx.unsafe(SCHEMA_SQL);
    await seed(tx);
  });
}

/** Adds any starting subject that isn't in the database yet (never overwrites your edits). */
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

    for (const [order, topic] of subject.topics.entries()) {
      await sql`
        insert into topics (subject_id, name, group_name, paper, weight, is_set_text, sort_order)
        values (${id}, ${topic.name}, ${topic.group}, ${topic.paper}, ${topic.weight},
                ${topic.setText ?? false}, ${order})`;
    }
    for (const a of subject.assessments) {
      await sql`
        insert into assessments (subject_id, kind, title, date, tbc)
        values (${id}, ${a.kind}, ${a.title}, ${a.date}, ${a.tbc})`;
    }
  }

  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    await sql`insert into settings (key, value) values (${key}, ${sql.json(value)}) on conflict (key) do nothing`;
  }
}
