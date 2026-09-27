import { headers } from "next/headers";
import { disconnectClaude, logout, revokeConnectorKey, updateSettings, updateSubject } from "../actions";
import NewKeyForm from "./NewKeyForm";
import SubmitButton from "@/components/SubmitButton";
import { loadCore } from "@/lib/data";
import { TIME_ZONES } from "@/lib/dates";
import { db } from "@/lib/db";
import { appOrigin } from "@/lib/origin";

const GUIDE = "https://github.com/jadthesweat58-dotcom/revision/blob/claude/zealous-ramanujan-yw27hi/CONNECTOR.md";

export default async function SettingsPage() {
  const core = await loadCore();
  const s = core.settings;
  const sql = await db();
  const keys = await sql<{ id: number; name: string; createdAt: Date; lastUsedAt: Date | null }[]>`
    select id, name, created_at, last_used_at from api_keys where not revoked order by created_at`;
  const [claude] = await sql<{ connections: number; lastUsed: Date | null }[]>`
    select count(distinct client_id)::int as connections, max(last_used_at) as last_used
    from oauth_tokens where kind = 'refresh' and not revoked and expires_at > now()`;
  const connectorUrl = `${appOrigin(`https://${(await headers()).get("host") ?? "localhost"}`)}/api/mcp`;
  const when = (d: Date | null) =>
    d ? new Date(d).toLocaleDateString("en-GB", { timeZone: s.timeZone, day: "numeric", month: "short" }) : "never";

  return (
    <>
      <h1>Settings</h1>

      <section className="card">
        <h2>Where you live</h2>
        <p className="small muted">So your daily plan and dates switch over at your midnight.</p>
        <form action={updateSettings} className="row">
          <input type="hidden" name="back" value="/settings" />
          <select name="timeZone" defaultValue={s.timeZone} style={{ maxWidth: 320 }}>
            {TIME_ZONES.map((z) => (
              <option key={z.id} value={z.id}>
                {z.label}
              </option>
            ))}
          </select>
          <SubmitButton>Save</SubmitButton>
        </form>
      </section>

      <section className="card">
        <h2>Weekly hours</h2>
        <p className="small muted">
          The app switches to a heavy week automatically when any mock or final exam is within the number of weeks below.
          Extra hours go mostly to the subject with the nearest exam.
        </p>
        <form action={updateSettings} className="form-grid">
          <input type="hidden" name="back" value="/settings" />
          <label>
            Normal week: min hours
            <input type="number" name="normalHoursMin" min={1} step={0.5} defaultValue={s.normalHoursMin} />
          </label>
          <label>
            Normal week: max hours
            <input type="number" name="normalHoursMax" min={1} step={0.5} defaultValue={s.normalHoursMax} />
          </label>
          <label>
            Heavy week: min hours
            <input type="number" name="heavyHoursMin" min={1} step={0.5} defaultValue={s.heavyHoursMin} />
          </label>
          <label>
            Heavy week: max hours
            <input type="number" name="heavyHoursMax" min={1} step={0.5} defaultValue={s.heavyHoursMax} />
          </label>
          <label>
            Heavy weeks before an exam
            <input type="number" name="heavyWeeksBefore" min={1} max={8} defaultValue={s.heavyWeeksBefore} />
          </label>
          <div className="full">
            <SubmitButton>Save hours</SubmitButton>
          </div>
        </form>
      </section>

      <section className="card">
        <h2>Subjects &amp; targets</h2>
        <p className="small muted">Exam dates are on the Homework &amp; tests page. Grade boundaries are on each subject&apos;s page.</p>
        <ul className="list">
          {core.subjects.map((subject) => (
            <li key={subject.id}>
              <form action={updateSubject} className="form-grid grow">
                <input type="hidden" name="subjectId" value={subject.id} />
                <input type="hidden" name="back" value="/settings" />
                <strong className="full">{subject.name}</strong>
                <label>
                  Board
                  <input name="board" defaultValue={subject.board} />
                </label>
                <label>
                  Spec code
                  <input name="specCode" defaultValue={subject.specCode} />
                </label>
                <label>
                  Target grade
                  <input type="number" name="targetGrade" min={1} max={9} defaultValue={subject.targetGrade} />
                </label>
                <label>
                  Stretch grade (optional)
                  <input type="number" name="stretchGrade" min={1} max={9} defaultValue={subject.stretchGrade ?? ""} />
                </label>
                <div className="full">
                  <SubmitButton className="btn small ghost">Save {subject.name}</SubmitButton>
                </div>
              </form>
            </li>
          ))}
        </ul>
      </section>

      <section className="card">
        <h2>Connectors (Claude chats and Jarvis)</h2>
        <p className="small muted">
          Lets Claude study chats and Jarvis read your plan and log sessions, homework, tests and scores. Full guide:{" "}
          <a href={GUIDE} style={{ color: "var(--accent)" }}>CONNECTOR.md</a>
        </p>
        <div className="stack small">
          <h3>Claude</h3>
          <p className="dim">
            In claude.ai: Settings → Connectors → Add custom connector, and paste this address:
          </p>
          <code className="badge" style={{ whiteSpace: "normal", wordBreak: "break-all", userSelect: "all" }}>
            {connectorUrl}
          </code>
          <div className="spread">
            <span className="dim">
              {claude?.connections ? `Connected (last used ${when(claude.lastUsed)})` : "Not connected yet"}
            </span>
            {claude?.connections ? (
              <form action={disconnectClaude}>
                <input type="hidden" name="back" value="/settings" />
                <SubmitButton className="btn small ghost">Disconnect Claude</SubmitButton>
              </form>
            ) : null}
          </div>
        </div>
        <div className="stack small">
          <h3>Keys for Jarvis (or other bots)</h3>
          <ul className="list">
            {keys.length === 0 && <li className="muted">No keys yet.</li>}
            {keys.map((k) => (
              <li key={k.id}>
                <span className="grow">
                  {k.name} <span className="muted">· made {when(k.createdAt)} · last used {when(k.lastUsedAt)}</span>
                </span>
                <form action={revokeConnectorKey}>
                  <input type="hidden" name="id" value={k.id} />
                  <input type="hidden" name="back" value="/settings" />
                  <SubmitButton className="btn small ghost">Switch off</SubmitButton>
                </form>
              </li>
            ))}
          </ul>
          <NewKeyForm />
        </div>
      </section>

      <section className="card">
        <h2>How the priorities work</h2>
        <p className="small dim">
          Every topic gets a score: <strong>marks weighting × weakness × urgency</strong>. Marks weighting is how much of the
          exam the topic is worth. Weakness is red 1, amber 0.6, green 0.25 (not rated 0.8). Urgency rises as that
          subject&apos;s next mock or exam gets closer. Topics that aren&apos;t due for review yet are held back, and a class test
          boosts the topics it covers. Today&apos;s plan takes the top scores, with no more than 2 topics from one subject.
        </p>
      </section>

      <form action={logout}>
        <button className="btn ghost">Log out</button>
      </form>
    </>
  );
}
