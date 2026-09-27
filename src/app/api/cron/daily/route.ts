// Runs once a day (see vercel.json), early morning in the Middle East / UK:
// 1. checks Teams for new homework (if connected),
// 2. makes today's plan, so it already includes that homework when you open the app.
// It also keeps the free Supabase database awake (it pauses after a week of no use).

import { NextResponse } from "next/server";
import { loadCore, overview, todaysPlan } from "@/lib/data";
import { db } from "@/lib/db";
import { syncTeams } from "@/lib/teams";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Not allowed" }, { status: 401 });
  }

  let teams: string;
  try {
    const result = await syncTeams(await db());
    teams = result ? `${result.assignments} assignments, ${result.added} new` : "not connected";
  } catch {
    teams = "failed (see Homework & tests page)";
  }

  const core = await loadCore();
  const plan = await todaysPlan(core, overview(core));
  return NextResponse.json({ ok: true, date: core.today, teams, planItems: plan.length });
}
