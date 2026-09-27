// "Allow Claude to use your revision app?" You only reach this page after logging in.

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { approveConnection, denyConnection } from "./actions";
import SubmitButton from "@/components/SubmitButton";
import { findClient, redirectAllowed } from "@/lib/agent/oauth";
import { db } from "@/lib/db";

export const metadata = { title: "Connect · Revision" };

export default async function AuthorizePage({ searchParams }: PageProps<"/oauth/authorize">) {
  const query = await searchParams;
  const get = (key: string) => (typeof query[key] === "string" ? (query[key] as string) : "");
  const redirectUri = get("redirect_uri");
  const client = await findClient(await db(), get("client_id"));

  if (!client || !redirectAllowed(client.redirectUris, redirectUri)) {
    return (
      <div className="card login">
        <h1>Link not valid</h1>
        <p className="dim">This connection link isn&apos;t valid or has expired. Start connecting again from Claude.</p>
      </div>
    );
  }
  if (get("response_type") !== "code" || !get("code_challenge") || (get("code_challenge_method") || "S256") !== "S256") {
    const url = new URL(redirectUri);
    url.searchParams.set("error", "invalid_request");
    if (get("state")) url.searchParams.set("state", get("state"));
    redirect(url.toString());
  }

  const destination = new URL(redirectUri).host;
  const name = client.clientName || destination;
  const host = (await headers()).get("host") ?? "";
  const hidden = { client_id: client.clientId, redirect_uri: redirectUri, code_challenge: get("code_challenge"), state: get("state"), host };
  const hiddenFields = Object.entries(hidden).map(([key, value]) => <input key={key} type="hidden" name={key} value={value} />);

  return (
    <div className="card login" style={{ maxWidth: 440 }}>
      <h1>Connect {name}?</h1>
      <p className="dim">
        <strong>{name}</strong> wants to use your revision app. It will be able to:
      </p>
      <ul className="dim small">
        <li>see your plan, topics, grades, homework and tests</li>
        <li>log study sessions, scores, mistakes and quotes</li>
        <li>add homework and tests, and mark homework done</li>
      </ul>
      <p className="small muted">
        After you allow it, you&apos;ll be sent back to <strong>{destination}</strong>. You can disconnect it any time in
        Settings → Connectors.
      </p>
      <div className="row">
        <form action={approveConnection}>
          {hiddenFields}
          <SubmitButton>Allow</SubmitButton>
        </form>
        <form action={denyConnection}>
          {hiddenFields}
          <SubmitButton className="btn ghost">Cancel</SubmitButton>
        </form>
      </div>
    </div>
  );
}
