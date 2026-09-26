import Link from "next/link";
import { loadCore, subjectName, weekSummary } from "@/lib/data";
import { addDays, dayOfWeek, formatDate, weekStart } from "@/lib/dates";
import { formatHours, formatMinutes } from "@/lib/format";

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default async function WeekPage({ searchParams }: PageProps<"/week">) {
  const query = await searchParams;
  const offset = Math.min(0, Math.round(Number(query.w) || 0)); // 0 = this week, -1 = last week...
  const core = await loadCore();
  const start = addDays(weekStart(core.today), offset * 7);
  const end = addDays(start, 6);
  const week = weekSummary(core, start);

  // How far through the week we are (so Monday doesn't flag everything).
  const isThisWeek = offset === 0;
  const fractionGone = isThisWeek ? (dayOfWeek(core.today) + 1) / 7 : 1;

  const rows = core.subjects
    .map((s) => {
      const minutes = week.subjectMinutes.get(s.id) ?? 0;
      const suggested = (week.subjectTargets.get(s.id) ?? 0) * 60;
      const tooLittle = suggested >= 30 && minutes < suggested * fractionGone * 0.5;
      return { subject: s, minutes, suggested, tooLittle };
    })
    .sort((a, b) => b.suggested - a.suggested);
  const scale = Math.max(...rows.map((r) => Math.max(r.minutes, r.suggested)), 60);

  const perDay = DAY_NAMES.map((_, i) => {
    const date = addDays(start, i);
    return { date, minutes: week.sessions.filter((s) => s.date === date).reduce((sum, s) => sum + s.minutes, 0) };
  });
  const dayScale = Math.max(...perDay.map((d) => d.minutes), 60);
  const flagged = rows.filter((r) => r.tooLittle);

  return (
    <>
      <div className="page-head">
        <div>
          <p className="muted small">
            {formatDate(start)} – {formatDate(end)}
          </p>
          <h1>{isThisWeek ? "This week" : offset === -1 ? "Last week" : `${-offset} weeks ago`}</h1>
        </div>
        <div className="tabs">
          <Link href={`/week?w=${offset - 1}`}>‹ Earlier</Link>
          {!isThisWeek && <Link href={offset + 1 === 0 ? "/week" : `/week?w=${offset + 1}`}>Later ›</Link>}
        </div>
      </div>

      <div className="grid-3">
        <div className="card stat">
          <span className="stat-label">Studied</span>
          <span className="stat-value">{formatHours(week.weekMinutes)}</span>
          <span className="stat-sub">
            target {week.weekTarget.min}–{week.weekTarget.max} h
          </span>
        </div>
        <div className="card stat">
          <span className="stat-label">Type of week</span>
          <span className="stat-value" style={{ fontSize: "1.3rem" }}>
            {week.weekTarget.heavy ? "Heavy" : "Normal"}
          </span>
          <span className="stat-sub">
            {week.weekTarget.heavy
              ? `${week.weekTarget.reason} on ${formatDate(week.weekTarget.reasonDate!)}`
              : "No mocks or exams in the next 4 weeks"}
          </span>
        </div>
        <div className="card stat">
          <span className="stat-label">Needs more time</span>
          <span className="stat-value" style={{ fontSize: "1.3rem" }}>
            {flagged.length === 0 ? "None ✓" : `${flagged.length} subject${flagged.length === 1 ? "" : "s"}`}
          </span>
          <span className="stat-sub">{flagged.map((r) => r.subject.name).join(", ")}</span>
        </div>
      </div>

      <section className="card">
        <div className="card-head">
          <h2>Hours per subject</h2>
          <span className="small muted">bar = studied · line = suggested for the week</span>
        </div>
        <ul className="list">
          {rows.map((r) => (
            <li key={r.subject.id}>
              <div className="grow">
                <div className="spread">
                  <Link href={`/subjects/${r.subject.slug}`}>{r.subject.name}</Link>
                  <span className="small num">
                    {formatHours(r.minutes)} <span className="muted">of ~{formatHours(Math.round(r.suggested / 6) * 6)}</span>
                  </span>
                </div>
                <div className="bar" style={{ marginTop: 6 }}>
                  <span style={{ width: `${(r.minutes / scale) * 100}%` }} />
                  <i className="marker" style={{ left: `${(r.suggested / scale) * 100}%` }} />
                </div>
                {r.tooLittle && <div className="small warning-text" style={{ marginTop: 4 }}>⚠ Too little time so far</div>}
              </div>
            </li>
          ))}
        </ul>
        <p className="small muted">
          Suggested hours share out your weekly target by priority. In heavy weeks the extra hours go to the subjects
          with the nearest exam.
        </p>
      </section>

      <div className="grid">
        <section className="card">
          <h2>By day</h2>
          <ul className="list small">
            {perDay.map((d, i) => (
              <li key={d.date}>
                <span style={{ width: 40 }}>{DAY_NAMES[i]}</span>
                <div className="bar grow">
                  <span style={{ width: `${(d.minutes / dayScale) * 100}%` }} />
                </div>
                <span className="num muted" style={{ width: 80, textAlign: "right" }}>
                  {d.minutes ? formatMinutes(d.minutes) : "—"}
                </span>
              </li>
            ))}
          </ul>
        </section>
        <section className="card">
          <h2>Sessions</h2>
          <ul className="list small">
            {week.sessions.length === 0 && <li className="muted">No sessions logged this week.</li>}
            {week.sessions.map((s) => (
              <li key={s.id}>
                <span className="grow">
                  {subjectName(core, s.subjectId)}
                  {s.struggles && <span className="muted"> · struggled: {s.struggles}</span>}
                </span>
                <span className="muted">
                  {formatDate(s.date)} · {formatMinutes(s.minutes)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}
