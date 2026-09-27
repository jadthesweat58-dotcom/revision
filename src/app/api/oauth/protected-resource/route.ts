// Served at /.well-known/oauth-protected-resource (see next.config.ts).
import { NextResponse, type NextRequest } from "next/server";
import { protectedResourceMetadata } from "@/lib/agent/oauth";
import { appOrigin } from "@/lib/origin";

export const dynamic = "force-dynamic";

export function GET(request: NextRequest) {
  return NextResponse.json(protectedResourceMetadata(appOrigin(request.url)));
}
