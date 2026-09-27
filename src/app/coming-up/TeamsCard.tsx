// The Microsoft Teams panel on the Homework & tests page.

import { headers } from "next/headers";
import { disconnectTeams, saveClassSubjects, syncTeamsNow } from "../actions";
import SubmitButton from "@/components/SubmitButton";
import { db } from "@/lib/db";
import { PROBLEM_TEXT, callbackUrl, loadTeams, teamsConfigured, type TeamsProblem } from "@/lib/teams";
import type { Subject } from "@/lib/types";

const SETUP_GUIDE = "https://github.com/jadthesweat58-dotcom/revision/blob/claude/zealous-ramanujan-yw27hi/TEAMS_SETUP.md";

export default async function TeamsCard({
  subjects,
  timeZone,
  outcome,
}: {
  subjects: Subject[];
  timeZone: string;
  outcome?: string;
}) {
  const sql = await db();
  const connection = await loadTeams(sql);
  const connected = Boolean(connection?.refreshToken);
  const classes = await sql<{ classId: string; name: string; subjectId: number | null }[]>`
    select class_id, name, subject_id from teams_classes order by name`;
  const host = (await headers()).get("host") ?? "localhost";
  const redirectUri = callbackUrl(`https://${host}`);
  const problem = teamsConfigured() ? (connection?.lastProblem as TeamsProblem | null | undefined) : null;
  const lastSync = connection?.lastSync
    ? new Date(connection.lastSync).toLocaleString("en-GB", {
        timeZone,
        weekday: "short",
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  return (
    <section className="card">
      <div className="card-head">
        <h2>Microsoft Teams</h2>
        {connected && <span className="badge good">Connected</span>}
      </div>

      {outcome === "connected" && connected && (
        <p className="notice small">
          Teams is connected. {connection?.lastResult ? `Found ${connection.lastResult}.` : ""} It checks again every
          morning.
        </p>
      )}

      {problem && (
        <p className="notice small">
          <strong>Teams couldn&apos;t sync.</strong> {PROBLEM_TEXT[problem]}
          {problem === "other" && connection?.lastProblemDetail ? ` (${connection.lastProblemDetail})` : ""}
        </p>
      )}

      {!teamsConfigured() ? (
        <div className="stack small">
          <p className="dim">
            To read homework from Teams, the app needs a (free) Microsoft app registration. It takes about 10 minutes
            in your browser: follow <a href={SETUP_GUIDE}>TEAMS_SETUP.md</a>.
          </p>
          <p className="dim">You&apos;ll need this web address (the &quot;Redirect URI&quot;) during setup:</p>
          <code className="badge" style={{ whiteSpace: "normal", wordBreak: "break-all" }}>
            {redirectUri}
          </code>
        </div>
      ) : !connected ? (
        <div className="stack small">
          <p className="dim">
            Sign in with your <strong>school</strong> Microsoft account. The app can only <em>read</em> your assignments
            and class names; it never changes anything in Teams.
          </p>
          <div>
            <a className="btn" href="/api/teams/connect">
              Connect Teams
            </a>
          </div>
        </div>
      ) : (
        <div className="stack small">
          <p className="dim">
            Signed in as {connection?.account}. {lastSync && `Last checked ${lastSync}`}
            {connection?.lastResult && !problem ? ` · ${connection.lastResult}` : ""}
          </p>
          <div className="row">
            <form action={syncTeamsNow}>
              <input type="hidden" name="back" value="/coming-up" />
              <SubmitButton className="btn small">Sync now</SubmitButton>
            </form>
            <form action={disconnectTeams}>
              <input type="hidden" name="back" value="/coming-up" />
              <SubmitButton className="btn small ghost">Disconnect</SubmitButton>
            </form>
          </div>
        </div>
      )}

      {classes.length > 0 && (
        <details open={classes.some((c) => c.subjectId === null)}>
          <summary>
            Your Teams classes ({classes.length})
            {classes.some((c) => c.subjectId === null) && " · some need a subject"}
          </summary>
          <form action={saveClassSubjects} className="stack" style={{ marginTop: 10 }}>
            <input type="hidden" name="back" value="/coming-up" />
            {classes.map((c) => (
              <label key={c.classId} className="spread" style={{ flexDirection: "row" }}>
                <span style={{ flex: 1 }}>{c.name}</span>
                <select name={`class_${c.classId}`} defaultValue={c.subjectId ?? ""} style={{ maxWidth: 220 }}>
                  <option value="">Not a GCSE subject</option>
                  {subjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
            ))}
            <div>
              <SubmitButton className="btn small">Save subjects</SubmitButton>
            </div>
          </form>
        </details>
      )}
    </section>
  );
}
