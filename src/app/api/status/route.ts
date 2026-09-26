// A quick health check you can open in the browser without logging in:
// https://your-app.vercel.app/api/status
// It shows whether the app can reach its database. It never shows passwords or data.

import { NextResponse } from "next/server";
import { passwordIsSet } from "@/lib/auth";
import { databaseSettingName, databaseSettingNames, db } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function explain(error: unknown): string {
  const { code, message = "" } = error as { code?: string; message?: string };
  if (code === "APP_TIMEOUT") {
    return `The database didn't answer in time (${message}). It may be jammed by stuck connections: see SETUP.md, "If something goes wrong".`;
  }
  if (code === "CONNECT_TIMEOUT" || /timeout/i.test(message)) {
    return "Timed out reaching the database. If the Supabase project is paused, open supabase.com and click Restore.";
  }
  if (code === "28P01" || /password authentication failed/i.test(message)) return "The database rejected the password in its address.";
  if (code === "ENOTFOUND" || /ENOTFOUND|getaddrinfo/i.test(message)) return "The database address couldn't be found.";
  if (/tenant or user not found/i.test(message)) return "Supabase doesn't recognise the user in the database address.";
  return `Database error${code ? ` ${code}` : ""}: ${message.slice(0, 200)}`;
}

export async function GET() {
  const started = Date.now();
  const base = { passwordSet: passwordIsSet(), databaseSetting: databaseSettingName() };
  if (!base.databaseSetting) {
    return NextResponse.json({ ok: false, ...base, problem: "No database connected", settingsSeen: databaseSettingNames() });
  }
  try {
    const sql = await db();
    const [{ topics }] = await sql<{ topics: number }[]>`select count(*)::int as topics from topics`;
    return NextResponse.json({ ok: true, ...base, topics, ms: Date.now() - started });
  } catch (error) {
    return NextResponse.json({ ok: false, ...base, problem: explain(error), ms: Date.now() - started }, { status: 500 });
  }
}
