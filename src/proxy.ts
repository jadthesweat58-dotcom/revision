// Runs before every page: anyone without a valid login cookie is sent to /login.

import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, isValidSessionToken } from "@/lib/auth";

// Pages that must work without logging in.
// The connector routes check their own keys/tokens.
const PUBLIC_PATHS = ["/login", "/api/cron/", "/api/status", "/api/mcp", "/api/agent", "/api/oauth/", "/.well-known/"];

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p))) {
    return NextResponse.next();
  }
  if (isValidSessionToken(request.cookies.get(SESSION_COOKIE)?.value)) {
    return NextResponse.next();
  }
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }
  const login = new URL("/login", request.url);
  login.searchParams.set("next", pathname + search);
  return NextResponse.redirect(login);
}

export const config = {
  // Skip Next.js internals and the files the home-screen app icon needs.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon-|apple-touch-icon|manifest.webmanifest).*)"],
};
