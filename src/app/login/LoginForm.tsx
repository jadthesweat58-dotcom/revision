"use client";

import { useActionState } from "react";
import { login } from "../actions";

export default function LoginForm({ next }: { next: string }) {
  const [error, formAction, pending] = useActionState(login, null);
  return (
    <form action={formAction} className="stack">
      <input type="hidden" name="next" value={next} />
      <label>
        Password
        <input type="password" name="password" autoComplete="current-password" autoFocus required />
      </label>
      {error && <p className="warning-text small">{error}</p>}
      <button className="btn" disabled={pending}>
        {pending ? "Checking…" : "Log in"}
      </button>
    </form>
  );
}
