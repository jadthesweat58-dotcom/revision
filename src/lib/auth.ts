// Password protection. There's one password (APP_PASSWORD, set in Vercel).
// Logging in gives the browser a signed cookie that lasts 90 days.

import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "revision_session";
export const SESSION_DAYS = 90;

function signingKey(): Buffer | null {
  const password = process.env.APP_PASSWORD;
  if (!password) return null;
  // Changing the password automatically logs out every device.
  return createHash("sha256").update(`revision-session:${process.env.SESSION_SECRET ?? ""}:${password}`).digest();
}

function sign(value: string, key: Buffer): string {
  return createHmac("sha256", key).update(value).digest("base64url");
}

function sameText(a: string, b: string): boolean {
  const x = createHash("sha256").update(a).digest();
  const y = createHash("sha256").update(b).digest();
  return timingSafeEqual(x, y);
}

export function passwordIsSet(): boolean {
  return Boolean(process.env.APP_PASSWORD);
}

export function checkPassword(attempt: string): boolean {
  const password = process.env.APP_PASSWORD;
  return Boolean(password) && sameText(attempt, password!);
}

export function createSessionToken(now = Date.now()): string {
  const key = signingKey();
  if (!key) throw new Error("APP_PASSWORD is not set");
  const expires = String(now + SESSION_DAYS * 86_400_000);
  return `${expires}.${sign(expires, key)}`;
}

export function isValidSessionToken(token: string | undefined, now = Date.now()): boolean {
  const key = signingKey();
  if (!key || !token) return false;
  const [expires, signature] = token.split(".");
  if (!expires || !signature) return false;
  if (!sameText(signature, sign(expires, key))) return false;
  return Number(expires) > now;
}
