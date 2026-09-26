// A health check you can open in the browser without logging in:
// https://your-app.vercel.app/api/status
// It answers within about 10 seconds and shows whether the app can reach its
// database, and if not, why. It never shows passwords or any of your data.
// If it finds database sessions stuck for over 30 seconds, it ends them.

import { NextResponse } from "next/server";
import { passwordIsSet } from "@/lib/auth";
import { backupSettingName, clearStuckSessions, connect, databaseSettingName, databaseSettingNames, withTimeout } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function explain(error: unknown): string {
  const { code, message = "" } = error as { code?: string; message?: string };
  if (code === "CONNECT_TIMEOUT") return "Couldn't connect within 5 seconds.";
  if (code === "APP_TIMEOUT") return `No answer in time (${message}).`;
  if (code === "28P01" || /password authentication failed/i.test(message)) return "The database rejected the password in its address.";
  if (code === "ENOTFOUND" || /ENOTFOUND|getaddrinfo/i.test(message)) return "The database address couldn't be found.";
  if (/tenant or user not found/i.test(message)) return "Supabase doesn't recognise the user in the database address.";
  if (code === "ECONNREFUSED" || /ECONNREFUSED/.test(message)) return "The database refused the connection (it may be paused or restarting).";
  const withoutAddresses = message.replace(/[\w.-]+:\d{2,5}/g, "[address]").slice(0, 200);
  return `Database error${code ? ` ${code}` : ""}: ${withoutAddresses}`;
}

/** Tries one database address step by step, noting how far it gets. */
async function probe(settingName: string) {
  const report: Record<string, unknown> = { setting: settingName };
  const started = Date.now();
  const sql = connect(process.env[settingName]!, 1);
  try {
    await withTimeout(sql`select 1`, 6_000, "Connecting");
    report.connected = true;
    report.connectMs = Date.now() - started;

    const sessions = await withTimeout(
      sql<{ state: string; waiting: string | null; count: number; oldestSeconds: number }[]>`
        select coalesce(state, '?') as state, wait_event_type as waiting, count(*)::int as count,
               coalesce(max(extract(epoch from now() - coalesce(xact_start, query_start)))::int, 0) as oldest_seconds
        from pg_stat_activity
        where usename = current_user and pid <> pg_backend_pid() and state is not null
        group by 1, 2 order by 3 desc`,
      2_000,
      "Listing connections",
    );
    report.otherConnections = sessions.map((s) => `${s.count}× ${s.state}${s.waiting ? ` (waiting: ${s.waiting})` : ""}, oldest ${s.oldestSeconds}s`);
    const stuck = sessions.some(
      (s) => s.oldestSeconds > 30 && (s.state.startsWith("idle in transaction") || s.waiting === "Lock" || (s.state === "active" && s.waiting === "Client")),
    );
    if (stuck) {
      await withTimeout(clearStuckSessions(sql, 30), 2_000, "Ending stuck connections");
      report.endedStuckConnections = true;
    }

    const [{ hasTables }] = await withTimeout(
      sql<{ hasTables: boolean }[]>`select to_regclass('public.settings') is not null as has_tables`,
      2_000,
      "Checking tables",
    );
    report.tablesCreated = hasTables;

    // Queries that include a value (most of the app's) are the ones that got stuck
    // through Supabase's connection sharer, so test one explicitly.
    const [{ answer }] = await withTimeout(sql<{ answer: number }[]>`select ${41}::int + 1 as answer`, 3_000, "A query with a value");
    report.queriesWithValues = answer === 42 ? "ok" : "wrong answer";
    if (hasTables) {
      const [row] = await withTimeout(
        sql<{ topics: number }[]>`select count(*)::int as topics from topics`,
        2_000,
        "Counting topics",
      );
      report.topics = row?.topics ?? 0;
    }
  } catch (error) {
    report.problem = explain(error);
  } finally {
    report.ms = Date.now() - started;
    sql.end({ timeout: 0 }).catch(() => {});
  }
  return report;
}

export async function GET() {
  const main = databaseSettingName();
  const base = { passwordSet: passwordIsSet(), settingsSeen: databaseSettingNames() };
  if (!main) return NextResponse.json({ ok: false, ...base, problem: "No database connected" });

  const backup = backupSettingName();
  const [mainReport, backupReport] = await Promise.all([probe(main), backup ? probe(backup) : Promise.resolve(null)]);
  const ok = Boolean(mainReport.connected && mainReport.tablesCreated && !mainReport.problem);
  const summary = ok
    ? `All good: the database is working and has ${mainReport.topics} topics.`
    : !mainReport.connected
      ? `Can't reach the database. ${mainReport.problem ?? ""}`
      : mainReport.problem
        ? `Connected, but something went wrong. ${mainReport.problem}`
        : "Connected, but the app hasn't set up its tables yet. Open the app and they'll be created.";
  return NextResponse.json(
    { ok, summary, ...base, database: mainReport, backupAddress: backupReport },
    { status: ok ? 200 : 500 },
  );
}
