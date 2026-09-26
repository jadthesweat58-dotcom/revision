import Link from "next/link";
import { notFound } from "next/navigation";
import { addTopic, deleteScore, updateBoundaries } from "@/app/actions";
import { StatusButtons, StatusChip } from "@/components/Status";
import SubmitButton from "@/components/SubmitButton";
import { loadCore, loadMistakes, loadScores, overview } from "@/lib/data";
import { daysBetween, formatDate, relativeDays } from "@/lib/dates";
import { aoTotals, questionTypeSummary } from "@/lib/english";
import { KIND_LABEL, percent, plural } from "@/lib/format";
import {
  fastestGapClosers,
  formatGrade,
  gradeFromPercent,
  markSchemeLevel,
  marksToGrade,
  workingGrade,
} from "@/lib/grades";
import { ASSESSMENT_OBJECTIVES } from "@/lib/constants";
import type { Subject, Topic } from "@/lib/types";

const CONFIDENCE_TEXT = { none: "No scores yet", low: "Low", medium: "Medium", high: "High" };

function reviewText(topic: Topic, today: string): string {
  if (!topic.nextReview || !topic.lastReviewed) return "Not rated yet";
  const days = daysBetween(today, topic.nextReview);
  if (days < 0) return `Review overdue by ${-days} day${days === -1 ? "" : "s"}`;
  if (days === 0) return "Review due today";
  return `Next review ${relativeDays(days)}`;
}

function gapSentence(marks: number | null, grade: number, subject: Subject): string | null {
  if (marks === null) return null;
  if (marks > 0) return `~${plural(marks, "mark")} short of a ${grade} (out of ${subject.boundaryMax} across all papers)`;
  return `~${plural(-marks, "mark")} above the grade ${grade} boundary`;
}

export default async function SubjectPage({ params }: PageProps<"/subjects/[slug]">) {
  const { slug } = await params;
  const core = await loadCore();
  const subject = core.subjects.find((s) => s.slug === slug);
  if (!subject) notFound();

  const ov = overview(core);
  const [scores, mistakes] = await Promise.all([loadScores(subject.id), loadMistakes(subject.id)]);
  const topics = core.topics.filter((t) => t.subjectId === subject.id);
  const archived = core.allTopics.filter((t) => t.subjectId === subject.id && t.archived);
  const estimate = workingGrade(subject, scores, topics, core.today);
  const closers = fastestGapClosers(subject, topics);
  const exams = core.assessments.filter((a) => a.subjectId === subject.id && a.date >= core.today);
  const isEnglish = subject.kind !== "standard";
  const back = `/subjects/${subject.slug}`;
  const topicName = new Map(core.allTopics.map((t) => [t.id, t.name]));

  const groups = new Map<string, Topic[]>();
  for (const t of topics) groups.set(t.groupName, [...(groups.get(t.groupName) ?? []), t]);

  const errorCounts = new Map<string, number>();
  for (const m of mistakes) errorCounts.set(m.errorType, (errorCounts.get(m.errorType) ?? 0) + 1);
  const topErrors = [...errorCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);

  return (
    <>
      <div className="page-head">
        <div>
          <p className="muted small">
            <Link href="/subjects">Subjects</Link> · {subject.board} · {subject.specCode}
          </p>
          <h1>{subject.name}</h1>
        </div>
        <Link className="btn small" href={`/log?subject=${subject.slug}`}>
          Log study or a score
        </Link>
      </div>

      <div className="grid">
        <section className="card">
          <h2>Working grade</h2>
          <div className="row" style={{ alignItems: "baseline" }}>
            <span className="stat-value">{formatGrade(estimate.grade)}</span>
            <span className="dim">
              target {subject.targetGrade}
              {subject.stretchGrade ? ` (stretch ${subject.stretchGrade})` : ""}
            </span>
          </div>
          <div className="row small">
            <span className={`badge ${estimate.confidence === "high" ? "good" : estimate.confidence === "medium" ? "accent" : "warn"}`}>
              Confidence: {CONFIDENCE_TEXT[estimate.confidence]}
            </span>
            {estimate.scoreCount > 0 && (
              <span className="muted">
                from your last {estimate.scoreCount} score{estimate.scoreCount === 1 ? "" : "s"} (avg{" "}
                {percent(estimate.averagePercent!)}), topic colours {estimate.masteryAdjustment >= 0 ? "+" : ""}
                {estimate.masteryAdjustment.toFixed(1)}
              </span>
            )}
          </div>
          {estimate.grade === null ? (
            <p className="muted small">
              Log a past paper or practice score to get a working grade. 3+ scores gives medium confidence, 6+ gives high.
            </p>
          ) : (
            <div className="stack small">
              <div>{gapSentence(marksToGrade(estimate.averagePercent, subject.targetGrade, subject), subject.targetGrade, subject)}</div>
              {subject.stretchGrade && (
                <div className="dim">
                  {gapSentence(marksToGrade(estimate.averagePercent, subject.stretchGrade, subject), subject.stretchGrade, subject)}
                </div>
              )}
              {isEnglish && (
                <div className="muted">
                  English scores are single questions compared to whole-exam boundaries, so treat this as a rough guide.
                </div>
              )}
            </div>
          )}
          <div className="stack">
            <h3>Fastest ways to close the gap</h3>
            <ul className="list small">
              {closers.map((c) => (
                <li key={c.topic.id}>
                  <span className="row grow">
                    <StatusChip status={c.topic.status} />
                    <Link href={`/topics/${c.topic.id}`}>{c.topic.name}</Link>
                  </span>
                  <span className="muted">up to ~{Math.round(c.marks)} marks</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="card">
          <h2>Coming up</h2>
          <ul className="list small">
            {exams.map((a) => (
              <li key={a.id}>
                <span className="grow">
                  {a.title} <span className="muted">· {KIND_LABEL[a.kind]}</span>
                </span>
                <span className="badge">
                  {formatDate(a.date)} · {relativeDays(daysBetween(core.today, a.date))}
                  {a.tbc ? " · TBC" : ""}
                </span>
              </li>
            ))}
          </ul>
          <Link href="/coming-up" className="small dim">
            Edit dates or add a test ›
          </Link>
          <p className="small dim">
            This week: {Math.round(((ov.subjectMinutes.get(subject.id) ?? 0) / 60) * 10) / 10} h studied of ~
            {Math.round((ov.subjectTargets.get(subject.id) ?? 0) * 10) / 10} h suggested.
          </p>
          {topErrors.length > 0 && (
            <div className="stack">
              <h3>Mistakes to watch for</h3>
              <ul className="list small">
                {topErrors.map(([type, count]) => (
                  <li key={type}>
                    <span>{type}</span>
                    <span className="muted">×{count}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </div>

      {isEnglish && <EnglishBreakdown subject={subject} topics={topics} scores={scores} />}

      <section className="card">
        <div className="card-head">
          <h2>{subject.kind === "english_lit" ? "Set texts & sections" : subject.kind === "english_lang" ? "Question types" : "Topics"}</h2>
          <span className="small muted">Tap R / A / G after you revise a topic</span>
        </div>
        {[...groups.entries()].map(([groupName, groupTopics]) => (
          <div key={groupName} className="stack">
            <h3>{groupName}</h3>
            <ul className="list">
              {groupTopics.map((t) => (
                <li key={t.id}>
                  <div className="row grow">
                    <StatusChip status={t.status} />
                    <div style={{ minWidth: 0 }}>
                      <Link href={`/topics/${t.id}`}>{t.name}</Link>
                      <div className="small muted">
                        {reviewText(t, core.today)} · priority {ov.priorities.get(t.id)?.score.toFixed(1)}
                        {t.isSetText && " · quotes & notes"}
                      </div>
                    </div>
                  </div>
                  <StatusButtons topicId={t.id} status={t.status} back={back} />
                </li>
              ))}
            </ul>
          </div>
        ))}
        {archived.length > 0 && (
          <p className="small muted">
            Not studying: {archived.map((t, i) => (
              <span key={t.id}>
                {i > 0 && ", "}
                <Link href={`/topics/${t.id}`}>{t.name}</Link>
              </span>
            ))}
          </p>
        )}
        <details>
          <summary>Add a topic</summary>
          <form action={addTopic} className="form-grid" style={{ marginTop: 10 }}>
            <input type="hidden" name="subjectId" value={subject.id} />
            <input type="hidden" name="back" value={back} />
            <label className="full">
              Topic name
              <input name="name" required />
            </label>
            <label>
              Group
              <input name="group" placeholder="My topics" list="groups" />
              <datalist id="groups">
                {[...groups.keys()].map((g) => (
                  <option key={g} value={g} />
                ))}
              </datalist>
            </label>
            <label>
              Marks weight
              <input name="weight" type="number" step="0.5" min="0.5" defaultValue={5} />
            </label>
            <div className="full">
              <SubmitButton>Add topic</SubmitButton>
            </div>
          </form>
        </details>
      </section>

      <section className="card">
        <div className="card-head">
          <h2>Scores</h2>
          <Link className="btn small ghost" href={`/log?subject=${subject.slug}#score`}>
            Log a score
          </Link>
        </div>
        {scores.length === 0 ? (
          <p className="muted">No scores logged yet.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>{isEnglish ? "Question" : "Paper"}</th>
                  <th>Score</th>
                  <th>%</th>
                  <th>{isEnglish ? "Level" : "Grade"}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {scores.map((s) => (
                  <tr key={s.id}>
                    <td className="num">{formatDate(s.date)}</td>
                    <td>
                      {[s.topicId ? topicName.get(s.topicId) : "", s.paper].filter(Boolean).join(" — ") || s.kind}
                    </td>
                    <td className="num">
                      {s.score}/{s.maxScore}
                    </td>
                    <td className="num">{percent(s.score / s.maxScore)}</td>
                    <td className="num">
                      {isEnglish
                        ? `L${markSchemeLevel(s.score, s.maxScore)}`
                        : formatGrade(gradeFromPercent(s.score / s.maxScore, subject))}
                    </td>
                    <td>
                      <form action={deleteScore}>
                        <input type="hidden" name="id" value={s.id} />
                        <input type="hidden" name="back" value={back} />
                        <button className="btn link" aria-label="Delete score">
                          ✕
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card">
        <details>
          <summary>Grade boundaries (edit)</summary>
          <p className="small muted">
            These started as estimates. Replace them with the latest numbers from Pearson&apos;s grade boundaries PDF
            for {subject.specCode} (search &quot;Pearson Edexcel grade boundaries&quot;). Enter the marks needed for each
            grade, out of the total for all papers.
          </p>
          <form action={updateBoundaries} className="form-grid">
            <input type="hidden" name="subjectId" value={subject.id} />
            <input type="hidden" name="back" value={back} />
            <label>
              Total marks (all papers)
              <input name="boundaryMax" type="number" min="1" defaultValue={subject.boundaryMax} />
            </label>
            {[9, 8, 7, 6, 5, 4, 3, 2, 1].map((g) => (
              <label key={g}>
                Grade {g}
                <input name={`grade_${g}`} type="number" min="0" defaultValue={subject.boundaries[String(g)] ?? ""} />
              </label>
            ))}
            <div className="full">
              <SubmitButton>Save boundaries</SubmitButton>
            </div>
          </form>
        </details>
      </section>
    </>
  );
}

function EnglishBreakdown({
  subject,
  topics,
  scores,
}: {
  subject: Subject;
  topics: Topic[];
  scores: Awaited<ReturnType<typeof loadScores>>;
}) {
  const aos = ASSESSMENT_OBJECTIVES[subject.kind as "english_lit" | "english_lang"];
  const totals = new Map(aoTotals(scores).map((t) => [t.code, t]));
  const byType = questionTypeSummary(topics, scores);
  return (
    <div className="grid">
      <section className="card">
        <h2>By assessment objective</h2>
        <ul className="list small">
          {aos.map((ao) => {
            const t = totals.get(ao.code);
            const value = t && t.max > 0 ? t.score / t.max : null;
            return (
              <li key={ao.code}>
                <div className="grow">
                  <strong>{ao.code}</strong> <span className="dim">{ao.label}</span>
                  <div className="bar" style={{ marginTop: 6 }}>
                    <span style={{ width: `${(value ?? 0) * 100}%` }} />
                  </div>
                </div>
                <span className="num muted">{value === null ? "no marks yet" : `${percent(value)} · ${t!.count} marked`}</span>
              </li>
            );
          })}
        </ul>
      </section>
      <section className="card">
        <h2>{subject.kind === "english_lit" ? "By text / section" : "By question type"}</h2>
        <ul className="list small">
          {byType.map((q) => (
            <li key={q.topic.id}>
              <span className="grow">{q.topic.name}</span>
              <span className="num muted">
                {q.averagePercent === null
                  ? "not marked yet"
                  : `avg ${percent(q.averagePercent)} · L${markSchemeLevel(q.latest!.score, q.latest!.maxScore)} last time · ${q.count}×`}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
