// Who is allowed to use the connector:
// - Jarvis (or any script) with a key made in Settings -> Connectors ("rev_...")
// - Claude chats, after you approve them with your app password (OAuth)
// Keys and tokens are only ever stored as SHA-256 hashes.

import { createHash, randomBytes } from "node:crypto";
import type { Sql } from "../db";

export const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");
export const newSecret = (prefix: string) => prefix + randomBytes(32).toString("base64url");

const API_KEY_PREFIX = "rev_";

/** A short name used as the "source" of anything a key adds, e.g. "jarvis". */
export function callerName(keyName: string): string {
  return keyName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30) || "agent";
}

export async function createApiKey(sql: Sql, name: string): Promise<string> {
  const key = newSecret(API_KEY_PREFIX);
  await sql`insert into api_keys (name, key_hash) values (${name}, ${sha256(key)})`;
  return key;
}

/** Checks the "Authorization: Bearer ..." header. Returns who is calling, or null. */
export async function authenticate(sql: Sql, authorization: string | null): Promise<{ caller: string } | null> {
  const token = /^Bearer\s+(\S+)\s*$/i.exec(authorization ?? "")?.[1];
  if (!token) return null;
  const hash = sha256(token);

  if (token.startsWith(API_KEY_PREFIX)) {
    const [key] = await sql<{ id: number; name: string }[]>`
      select id, name from api_keys where key_hash = ${hash} and not revoked`;
    if (!key) return null;
    await sql`update api_keys set last_used_at = now() where id = ${key.id}`;
    return { caller: callerName(key.name) };
  }

  const [access] = await sql<{ clientId: string }[]>`
    select client_id from oauth_tokens
    where token_hash = ${hash} and kind = 'access' and not revoked and expires_at > now()`;
  if (!access) return null;
  await sql`update oauth_tokens set last_used_at = now() where token_hash = ${hash}`;
  return { caller: "claude" };
}
