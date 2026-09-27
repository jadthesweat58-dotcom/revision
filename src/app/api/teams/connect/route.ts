// "Connect Teams" button: sends you to Microsoft to sign in with your school account.

import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { OAUTH_COOKIE, appOrigin, authorizeUrl, callbackUrl, teamsConfigured } from "@/lib/teams";

export const dynamic = "force-dynamic";

export function GET(request: NextRequest) {
  if (!teamsConfigured()) return NextResponse.redirect(new URL("/coming-up?teams=not_set_up", request.url));

  // Always start from the main web address, so the return trip lands on the same site.
  const origin = appOrigin(request.url);
  if (new URL(request.url).origin !== origin) return NextResponse.redirect(`${origin}/api/teams/connect`);

  const state = randomBytes(16).toString("base64url");
  const verifier = randomBytes(32).toString("base64url");
  const response = NextResponse.redirect(authorizeUrl(callbackUrl(request.url), state, verifier));
  response.cookies.set(OAUTH_COOKIE, `${state}.${verifier}`, {
    httpOnly: true,
    secure: origin.startsWith("https://"),
    sameSite: "lax",
    path: "/api/teams",
    maxAge: 600,
  });
  return response;
}
