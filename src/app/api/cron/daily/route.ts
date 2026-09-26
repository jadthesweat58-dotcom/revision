// Runs once a day (see vercel.json). For now it keeps the free Supabase
// database awake (it pauses after a week of no use) and makes today's plan
// ready before you open the app. Teams sync will be added here in the next phase.

import { NextResponse } from "next/server";
import { loadCore, overview, todaysPlan } from "@/lib/data";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Not allowed" }, { status: 401 });
  }
  const core = await loadCore();
  const plan = await todaysPlan(core, overview(core));
  return NextResponse.json({ ok: true, date: core.today, planItems: plan.length });
}
