// Served at /.well-known/oauth-authorization-server (see next.config.ts).
import { NextResponse, type NextRequest } from "next/server";
import { authorizationServerMetadata } from "@/lib/agent/oauth";
import { appOrigin } from "@/lib/origin";

export const dynamic = "force-dynamic";

export function GET(request: NextRequest) {
  return NextResponse.json(authorizationServerMetadata(appOrigin(request.url)));
}
