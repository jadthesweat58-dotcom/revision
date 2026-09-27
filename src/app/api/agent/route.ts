// Simple JSON connector for Jarvis or any script (no MCP needed).
//   GET  /api/agent                    -> the list of tools and their inputs
//   POST /api/agent  {"tool": "...", "arguments": {...}}  -> runs one tool
// Send "Authorization: Bearer <key>" with a key from Settings -> Connectors.

import { NextResponse, type NextRequest } from "next/server";
import { authenticate } from "@/lib/agent/auth";
import { ToolError, runTool, toolList } from "@/lib/agent/tools";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const unauthorized = () =>
  NextResponse.json({ ok: false, error: "Missing or invalid key. Create one in Settings -> Connectors." }, { status: 401 });

export async function GET(request: NextRequest) {
  const sql = await db();
  if (!(await authenticate(sql, request.headers.get("authorization")))) return unauthorized();
  return NextResponse.json({ ok: true, tools: toolList() });
}

export async function POST(request: NextRequest) {
  const sql = await db();
  const auth = await authenticate(sql, request.headers.get("authorization"));
  if (!auth) return unauthorized();

  let body: { tool?: unknown; arguments?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Send JSON like {"tool": "get_priorities", "arguments": {}}' }, { status: 400 });
  }
  try {
    const result = await runTool(String(body.tool ?? ""), body.arguments ?? {}, { sql, caller: auth.caller });
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    if (error instanceof ToolError) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    return NextResponse.json({ ok: false, error: `Something went wrong: ${(error as Error)?.message ?? error}` }, { status: 500 });
  }
}
