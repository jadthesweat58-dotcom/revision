"use server";

// Your answer on the "Allow Claude?" screen.

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, isValidSessionToken } from "@/lib/auth";
import { SCOPE, createAuthCode, findClient, redirectAllowed } from "@/lib/agent/oauth";
import { db } from "@/lib/db";
import { appOrigin } from "@/lib/origin";

function backTo(redirectUri: string, params: Record<string, string>) {
  const url = new URL(redirectUri);
  for (const [key, value] of Object.entries(params)) if (value) url.searchParams.set(key, value);
  return url.toString();
}

async function checked(fd: FormData) {
  if (!isValidSessionToken((await cookies()).get(SESSION_COOKIE)?.value)) redirect("/login");
  const get = (key: string) => String(fd.get(key) ?? "");
  const sql = await db();
  const client = await findClient(sql, get("client_id"));
  if (!client || !redirectAllowed(client.redirectUris, get("redirect_uri"))) redirect("/");
  return { sql, get };
}

export async function approveConnection(fd: FormData) {
  const { sql, get } = await checked(fd);
  const code = await createAuthCode(sql, get("client_id"), get("redirect_uri"), get("code_challenge"), SCOPE);
  const origin = appOrigin(`https://${get("host") || "localhost"}`);
  redirect(backTo(get("redirect_uri"), { code, state: get("state"), iss: origin }));
}

export async function denyConnection(fd: FormData) {
  const { get } = await checked(fd);
  redirect(backTo(get("redirect_uri"), { error: "access_denied", state: get("state") }));
}
