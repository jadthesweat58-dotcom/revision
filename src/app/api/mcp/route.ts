// The Claude connector: https://your-app.vercel.app/api/mcp
// Add this address in claude.ai -> Settings -> Connectors -> Add custom connector.

import { NextResponse, type NextRequest } from "next/server";
import { authenticate } from "@/lib/agent/auth";
import { handleMcpMessage } from "@/lib/agent/mcp";
import { db } from "@/lib/db";
import { appOrigin } from "@/lib/origin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const sql = await db();
  const auth = await authenticate(sql, request.headers.get("authorization"));
  if (!auth) {
    // Tells Claude where to sign in (OAuth discovery).
    return NextResponse.json(
      { error: "unauthorized", error_description: "Sign in to connect." },
      {
        status: 401,
        headers: {
          "WWW-Authenticate": `Bearer resource_metadata="${appOrigin(request.url)}/.well-known/oauth-protected-resource"`,
        },
      },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, { status: 400 });
  }

  const ctx = { sql, caller: auth.caller };
  if (Array.isArray(body)) {
    const replies = (await Promise.all(body.map((m) => handleMcpMessage(m, ctx)))).filter(Boolean);
    return replies.length ? NextResponse.json(replies) : new NextResponse(null, { status: 202 });
  }
  const response = await handleMcpMessage(body as Parameters<typeof handleMcpMessage>[0], ctx);
  return response ? NextResponse.json(response) : new NextResponse(null, { status: 202 });
}

// This server only answers POSTs (no server-sent event stream).
export function GET() {
  return new NextResponse("Method Not Allowed", { status: 405, headers: { Allow: "POST" } });
}
export const DELETE = GET;
