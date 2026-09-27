// Microsoft sends you back here after you sign in. Saves the connection and
// runs the first sync, then returns you to Homework & tests.

import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import {
  OAUTH_COOKIE,
  TeamsError,
  appOrigin,
  callbackUrl,
  classifyMicrosoftError,
  encrypt,
  exchangeCode,
  recordProblem,
  saveTeams,
  syncTeams,
  whoAmI,
} from "@/lib/teams";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const sql = await db();

  const finish = (outcome: string) => {
    const response = NextResponse.redirect(`${appOrigin(request.url)}/coming-up?teams=${outcome}`);
    response.cookies.delete({ name: OAUTH_COOKIE, path: "/api/teams" });
    return response;
  };

  // Microsoft said no (e.g. the school needs to approve the app, or you pressed Cancel).
  const error = params.get("error");
  if (error) {
    const description = params.get("error_description") ?? "";
    const problem = classifyMicrosoftError(error, description);
    await recordProblem(sql, problem, description.split(/\r?\n/)[0].slice(0, 300));
    return finish(problem);
  }

  const [state, verifier] = (request.cookies.get(OAUTH_COOKIE)?.value ?? "").split(".");
  const code = params.get("code");
  if (!state || !verifier || !code || state !== params.get("state")) {
    await recordProblem(sql, "other", "The sign-in took too long or was opened in a different browser. Tap Connect Teams again.");
    return finish("other");
  }

  try {
    const tokens = await exchangeCode(code, callbackUrl(request.url), verifier);
    if (!tokens.refresh_token) throw new TeamsError("other", "Microsoft didn't allow staying signed in (offline access).");
    await saveTeams(sql, {
      refreshToken: encrypt(tokens.refresh_token),
      account: await whoAmI(tokens.access_token),
      connectedAt: new Date().toISOString(),
      lastProblem: null,
      lastProblemDetail: "",
    });
    await syncTeams(sql, tokens.access_token);
    return finish("connected");
  } catch (err) {
    const problem = err instanceof TeamsError ? err.problem : "other";
    const detail = err instanceof TeamsError && err.message !== problem ? err.message : String((err as Error)?.message ?? "");
    await recordProblem(sql, problem, problem === "other" ? detail.slice(0, 300) : "");
    return finish(problem);
  }
}
