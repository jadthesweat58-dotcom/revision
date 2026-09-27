// Dynamic Client Registration: Claude registers itself here before signing in.

import { NextResponse, type NextRequest } from "next/server";
import { OAuthError, registerClient } from "@/lib/agent/oauth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    return NextResponse.json(await registerClient(await db(), body), { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof OAuthError) {
      return NextResponse.json({ error: error.code, error_description: error.message }, { status: error.status });
    }
    throw error;
  }
}
