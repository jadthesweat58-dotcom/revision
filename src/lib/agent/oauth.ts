// OAuth for Claude chats (claude.ai custom connector).
// Claude registers itself (Dynamic Client Registration), sends you to
// /oauth/authorize where you log in with your app password and tap Allow,
// then swaps the one-time code for tokens (with PKCE, so a stolen code is useless).

import { createHash, randomBytes } from "node:crypto";
import type { Sql } from "../db";
import { newSecret, sha256 } from "./auth";

export const SCOPE = "revision";
const ACCESS_SECONDS = 60 * 60; // 1 hour
const REFRESH_DAYS = 90;
const CODE_SECONDS = 5 * 60;

export class OAuthError extends Error {
  constructor(
    public code: string,
    description: string,
    public status = 400,
  ) {
    super(description);
  }
}

// ---------- Discovery documents ----------

export function protectedResourceMetadata(origin: string) {
  return {
    resource: `${origin}/api/mcp`,
    authorization_servers: [origin],
    scopes_supported: [SCOPE],
    bearer_methods_supported: ["header"],
    resource_name: "Revision command centre",
  };
}

export function authorizationServerMetadata(origin: string) {
  return {
    issuer: origin,
    authorization_endpoint: `${origin}/oauth/authorize`,
    token_endpoint: `${origin}/api/oauth/token`,
    registration_endpoint: `${origin}/api/oauth/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: [SCOPE, "offline_access"],
  };
}

// ---------- Redirect addresses ----------

function isLoopback(url: URL) {
  return url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
}

/** Only https addresses, or http on this computer (Claude Code uses http://localhost:<port>/callback). */
export function acceptableRedirect(uri: string): boolean {
  try {
    const url = new URL(uri);
    return (url.protocol === "https:" || isLoopback(url)) && !url.hash;
  } catch {
    return false;
  }
}

/** Exact match, except loopback addresses match on any port (RFC 8252). */
export function redirectAllowed(registered: string[], requested: string): boolean {
  if (registered.includes(requested)) return true;
  try {
    const want = new URL(requested);
    if (!isLoopback(want)) return false;
    return registered.some((r) => {
      const have = new URL(r);
      return isLoopback(have) && have.hostname === want.hostname && have.pathname === want.pathname;
    });
  } catch {
    return false;
  }
}

// ---------- Clients ----------

export interface OAuthClient {
  clientId: string;
  clientName: string;
  redirectUris: string[];
}

export async function registerClient(sql: Sql, body: unknown) {
  const request = (body ?? {}) as { redirect_uris?: unknown; client_name?: unknown };
  const uris = Array.isArray(request.redirect_uris) ? request.redirect_uris.filter((u): u is string => typeof u === "string") : [];
  if (uris.length === 0 || uris.length > 10 || !uris.every(acceptableRedirect)) {
    throw new OAuthError("invalid_redirect_uri", "redirect_uris must be https addresses (or http://localhost for local apps).");
  }
  const clientId = "client_" + randomBytes(16).toString("base64url");
  const clientName = typeof request.client_name === "string" ? request.client_name.slice(0, 100) : "";
  await sql`insert into oauth_clients (client_id, client_name, redirect_uris)
            values (${clientId}, ${clientName}, ${sql.json(uris)})`;
  return {
    client_id: clientId,
    client_id_issued_at: Math.floor(Date.now() / 1000),
    client_name: clientName || undefined,
    redirect_uris: uris,
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    token_endpoint_auth_method: "none",
  };
}

export async function findClient(sql: Sql, clientId: string): Promise<OAuthClient | null> {
  const [row] = await sql<OAuthClient[]>`
    select client_id, client_name, redirect_uris from oauth_clients where client_id = ${clientId}`;
  return row ?? null;
}

// ---------- Codes and tokens ----------

export async function createAuthCode(sql: Sql, clientId: string, redirectUri: string, codeChallenge: string, scope: string) {
  const code = newSecret("code_");
  await sql`insert into oauth_codes (code_hash, client_id, redirect_uri, code_challenge, scope, expires_at)
            values (${sha256(code)}, ${clientId}, ${redirectUri}, ${codeChallenge}, ${scope},
                    now() + make_interval(secs => ${CODE_SECONDS}))`;
  return code;
}

async function issueTokens(sql: Sql, clientId: string, scope: string) {
  const access = newSecret("at_");
  const refresh = newSecret("rt_");
  await sql`insert into oauth_tokens (token_hash, kind, client_id, scope, expires_at) values
            (${sha256(access)}, 'access', ${clientId}, ${scope}, now() + make_interval(secs => ${ACCESS_SECONDS})),
            (${sha256(refresh)}, 'refresh', ${clientId}, ${scope}, now() + make_interval(days => ${REFRESH_DAYS}))`;
  return { access_token: access, token_type: "Bearer", expires_in: ACCESS_SECONDS, refresh_token: refresh, scope };
}

function pkceMatches(verifier: string, challenge: string) {
  return createHash("sha256").update(verifier).digest("base64url") === challenge;
}

/** The token endpoint: swaps a one-time code, or a refresh token, for new tokens. */
export async function tokenRequest(sql: Sql, form: URLSearchParams) {
  const grant = form.get("grant_type");
  const clientId = form.get("client_id") ?? "";
  if (!(await findClient(sql, clientId))) throw new OAuthError("invalid_client", "Unknown client.", 401);

  if (grant === "authorization_code") {
    const code = form.get("code") ?? "";
    const [row] = await sql<{ clientId: string; redirectUri: string; codeChallenge: string; scope: string }[]>`
      update oauth_codes set used = true
      where code_hash = ${sha256(code)} and not used and expires_at > now()
      returning client_id, redirect_uri, code_challenge, scope`;
    if (!row || row.clientId !== clientId) throw new OAuthError("invalid_grant", "The code is invalid or has expired.");
    if (form.get("redirect_uri") && form.get("redirect_uri") !== row.redirectUri) {
      throw new OAuthError("invalid_grant", "redirect_uri doesn't match.");
    }
    if (!pkceMatches(form.get("code_verifier") ?? "", row.codeChallenge)) {
      throw new OAuthError("invalid_grant", "PKCE check failed.");
    }
    return issueTokens(sql, clientId, row.scope);
  }

  if (grant === "refresh_token") {
    // Each refresh token works once: it's swapped for a new pair.
    const [row] = await sql<{ scope: string }[]>`
      update oauth_tokens set revoked = true
      where token_hash = ${sha256(form.get("refresh_token") ?? "")} and kind = 'refresh' and client_id = ${clientId}
        and not revoked and expires_at > now()
      returning scope`;
    if (!row) throw new OAuthError("invalid_grant", "The refresh token is invalid or has expired.");
    return issueTokens(sql, clientId, row.scope);
  }

  throw new OAuthError("unsupported_grant_type", "Use authorization_code or refresh_token.");
}

/** "Disconnect Claude" in Settings: ends every Claude connection. */
export async function revokeAllClaude(sql: Sql) {
  await sql`update oauth_tokens set revoked = true where not revoked`;
}
