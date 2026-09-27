"use client";

import { useActionState } from "react";
import { createConnectorKey } from "../actions";

/** Creates a key for Jarvis and shows it once. */
export default function NewKeyForm() {
  const [state, action, pending] = useActionState(createConnectorKey, null);
  return (
    <div className="stack">
      <form action={action} className="row">
        <input name="name" placeholder="Name, e.g. Jarvis" style={{ maxWidth: 240 }} required />
        <button className="btn small" disabled={pending}>
          {pending ? "Creating…" : "Create key"}
        </button>
      </form>
      {state?.error && <p className="small warning-text">{state.error}</p>}
      {state?.key && (
        <div className="notice small stack">
          <strong>Key for {state.name}. Copy it now: it won&apos;t be shown again.</strong>
          <code style={{ wordBreak: "break-all", userSelect: "all" }}>{state.key}</code>
          <span>Put it in Jarvis&apos;s settings (not in a chat). Jarvis sends it as: Authorization: Bearer &lt;key&gt;</span>
        </div>
      )}
    </div>
  );
}
