/**
 * The app's main web address (e.g. https://revision-xi-bay.vercel.app).
 * Sign-in flows (Microsoft, Claude) must always use this one address, even if
 * the app was opened through a different Vercel link.
 */
export function appOrigin(requestUrl: string): string {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return new URL(requestUrl).origin;
}
