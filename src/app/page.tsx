import Link from "next/link";
import { rebuildPlan, setHomeworkDone } from "./actions";
import SubmitButton from "@/components/SubmitButton";
import { loadCore, overview, subjectName, todaysPlan } from "@/lib/data";
import { daysBetween, formatDate, relativeDays } from "@/lib/dates";
import { KIND_LABEL, formatHours, formatMinutes } from "@/lib/format";
import { nextExam } from "@/lib/revision";

export default async function TodayPage() {
  const core = await loadCore();
  const ov = overview(core);
  const plan = await todaysPlan(core, ov);
  const { today } = core;

  const studiedToday = core.sessions.filter((s) => s.date === today);
  const topicsDoneToday = new Set(studiedToday.flatMap((s) => s.topicIds));
  const homeworkById = new Map(core.homework.map((h) => [h.id, h]));
  const plannedMinutes = plan.reduce((sum, item) => sum + item.minutes, 0);
  const minutesToday = studiedToday.reduce((sum, s) => sum + s.minutes, 0);
  const subjectSlug = (id: number | null) => core.subjects.find((s) => s.id === id)?.slug ?? "";

  // Countdowns: the next mock or final for each subject, soonest first.
  const countdowns = core.subjects
    .map((subject) => ({ subject, exam: nextExam(subject.id, core.assessments, today) }))
    .filter((c) => c.exam !== null)
    .sort((a, b) => a.exam!.date.localeCompare(b.exam!.date));
  const nextOne = countdowns[0];

  // Coming up in the next 14 days: homework and any test, mock or exam.
  const comingUp = [
    ...core.homework
      .filter((h) => !h.done && daysBetween(today, h.dueDate) <= 14)
      .map((h) => ({ key: `h${h.id}`, date: h.dueDate, label: "Homework", title: h.title, subjectId: h.subjectId })),
    ...core.assessments
      .filter((a) => a.date >= today && daysBetween(today, a.date) <= 14)
      .map((a) => ({ key: `a${a.id}`, date: a.date, label: KIND_LABEL[a.kind], title: a.title, subjectId: a.subjectId })),
  ].sort((a, b) => a.date.localeCompare(b.date));

  const teamsConnected = core.teamsConnected;

  return (
    <>
      <div className="page-head">
        <div>
          <p className="muted small">{formatDate(today, "long")}</p>
          <h1>Today</h1>
        </div>
      </div>

      <div className="grid-3">
        <div className="card stat">
          <span className="stat-label">Streak</span>
          <span className="stat-value">{ov.streak.days} {ov.streak.days === 1 ? "day" : "days"}</span>
          <span className="stat-sub">
            {ov.streak.studiedToday ? "Studied today ✓" : ov.streak.days > 0 ? "Log today to keep it going" : "Log a session to start one"}
          </span>
        </div>
        <div className="card stat">
          <span className="stat-label">This week</span>
          <span className="stat-value">
            {formatHours(ov.weekMinutes)}
            <span className="stat-sub"> of {ov.weekTarget.min}–{ov.weekTarget.max} h</span>
          </span>
          <div className="bar" aria-label={`${formatHours(ov.weekMinutes)} of ${ov.weekTarget.max} hours`}>
            <span style={{ width: `${Math.min(100, (ov.weekMinutes / (ov.weekTarget.max * 60)) * 100)}%` }} />
            <i className="marker" style={{ left: `${(ov.weekTarget.min / ov.weekTarget.max) * 100}%` }} />
          </div>
          <span className="stat-sub">
            {ov.weekTarget.heavy ? (
              <span className="badge warn">Heavy week — {ov.weekTarget.reason} {formatDate(ov.weekTarget.reasonDate!)}</span>
            ) : (
              "Normal week"
            )}
          </span>
        </div>
        <div className="card stat">
          <span className="stat-label">Next exam</span>
          {nextOne ? (
            <>
              <span className="stat-value">{daysBetween(today, nextOne.exam!.date)} days</span>
              <span className="stat-sub">
                {nextOne.subject.name} {KIND_LABEL[nextOne.exam!.kind].toLowerCase()} · {formatDate(nextOne.exam!.date)}
                {nextOne.exam!.tbc && " (date TBC)"}
              </span>
            </>
          ) : (
            <span className="stat-sub">No exams added</span>
          )}
        </div>
      </div>

      <div className="grid">
        <section className="card">
          <div className="card-head">
            <h2>Today&apos;s plan</h2>
            <span className="muted small">
              {formatMinutes(plannedMinutes)} planned · {formatMinutes(minutesToday)} done
            </span>
          </div>
          {!teamsConnected && (
            <p className="notice small">
              Teams isn&apos;t connected yet, so this plan only knows about homework and tests you add in{" "}
              <Link href="/coming-up">Homework &amp; tests</Link>.
            </p>
          )}
          <div>
            {plan.map((item) => {
              const homework = item.homeworkId ? homeworkById.get(item.homeworkId) : undefined;
              const isDone = item.kind === "topic" ? topicsDoneToday.has(item.topicId!) : Boolean(homework?.done);
              return (
                <div key={`${item.kind}-${item.topicId ?? item.homeworkId}`} className={`plan-item ${isDone ? "done" : ""}`}>
                  <span className="tick" aria-label={isDone ? "Done" : "Not done yet"}>
                    {isDone ? "✓" : ""}
                  </span>
                  <div className="grow" style={{ flex: 1, minWidth: 0 }}>
                    <div className="plan-title">
                      {item.topicId ? <Link href={`/topics/${item.topicId}`}>{item.title}</Link> : item.title}
                    </div>
                    <div className="small dim">
                      {subjectName(core, item.subjectId)} · {formatMinutes(item.minutes)}
                    </div>
                    <div className="small muted">{item.reason}</div>
                  </div>
                  {item.kind === "topic" && !isDone && (
                    <Link className="btn small ghost" href={`/log?subject=${subjectSlug(item.subjectId)}&topic=${item.topicId}`}>
                      Log it
                    </Link>
                  )}
                  {item.kind === "homework" && homework && (
                    <form action={setHomeworkDone}>
                      <input type="hidden" name="id" value={homework.id} />
                      <input type="hidden" name="done" value={String(!homework.done)} />
                      <SubmitButton className="btn small ghost">{homework.done ? "Undo" : "Done"}</SubmitButton>
                    </form>
                  )}
                </div>
              );
            })}
          </div>
          <form action={rebuildPlan} className="spread">
            <span className="small muted">
              Made from your top priorities. {ov.weekTarget.heavy ? "Heavy week, so the sessions are longer." : ""}
            </span>
            <SubmitButton className="btn link">Rebuild plan</SubmitButton>
          </form>
        </section>

        <section className="card">
          <div className="card-head">
            <h2>Coming up (next 14 days)</h2>
            <Link href="/coming-up" className="btn small ghost">
              Add
            </Link>
          </div>
          {comingUp.length === 0 ? (
            <p className="muted">Nothing in the next two weeks.</p>
          ) : (
            <ul className="list">
              {comingUp.map((c) => {
                const days = daysBetween(today, c.date);
                return (
                  <li key={c.key}>
                    <div className="grow">
                      <div>{c.title}</div>
                      <div className="small muted">
                        {c.label} · {subjectName(core, c.subjectId)}
                      </div>
                    </div>
                    <span className={`badge ${days < 0 ? "bad" : days <= 2 ? "warn" : ""}`}>
                      {formatDate(c.date)} · {relativeDays(days)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      <section className="card">
        <h2>Countdowns</h2>
        <div className="grid-3">
          {countdowns.map(({ subject, exam }) => (
            <Link key={subject.id} href={`/subjects/${subject.slug}`} className="stack" style={{ gap: 2 }}>
              <span className="small dim">{subject.name}</span>
              <span style={{ fontSize: "1.3rem", fontWeight: 650 }} className="num">
                {daysBetween(today, exam!.date)} days
              </span>
              <span className="small muted">
                {exam!.title} · {formatDate(exam!.date)} {exam!.tbc && <span className="badge">TBC</span>}
              </span>
            </Link>
          ))}
        </div>
      </section>
    </>
  );
}
