// Token endpoint: swaps the one-time code (or a refresh token) for access tokens.

import { NextResponse, type NextRequest } from "next/server";
import { OAuthError, tokenRequest } from "@/lib/agent/oauth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const headers = { "Cache-Control": "no-store", Pragma: "no-cache" };
  try {
    const form = new URLSearchParams(await request.text());
    return NextResponse.json(await tokenRequest(await db(), form), { headers });
  } catch (error) {
    if (error instanceof OAuthError) {
      return NextResponse.json({ error: error.code, error_description: error.message }, { status: error.status, headers });
    }
    throw error;
  }
}
