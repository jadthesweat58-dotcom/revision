import Link from "next/link";
import { notFound } from "next/navigation";
import { addQuote, addTextNote, deleteQuote, deleteTextNote, setTopicArchived, updateTopic } from "@/app/actions";
import { STATUS_NAME, StatusButtons, StatusChip } from "@/components/Status";
import SubmitButton from "@/components/SubmitButton";
import { loadCore, loadMistakes, overview } from "@/lib/data";
import { db } from "@/lib/db";
import { daysBetween, formatDate, relativeDays } from "@/lib/dates";
import { plural } from "@/lib/format";
import type { Quote, Status, TextNote } from "@/lib/types";

export default async function TopicPage({ params }: PageProps<"/topics/[id]">) {
  const id = Number((await params).id);
  const core = await loadCore();
  const topic = core.allTopics.find((t) => t.id === id);
  if (!topic) notFound();
  const subject = core.subjects.find((s) => s.id === topic.subjectId)!;
  const priority = overview(core).priorities.get(topic.id);
  const back = `/topics/${topic.id}`;

  const sql = await db();
  const [reviews, quotes, notes, mistakes] = await Promise.all([
    sql<{ id: number; date: string; status: Status }[]>`
      select id, date, status from topic_reviews where topic_id = ${id} order by date desc, id desc limit 20`,
    sql<Quote[]>`select id, topic_id, text, theme, character, times_quizzed, times_correct
                 from quotes where topic_id = ${id} order by id desc`,
    sql<TextNote[]>`select id, topic_id, kind, name, notes from text_notes where topic_id = ${id} order by kind, name`,
    loadMistakes(subject.id).then((all) => all.filter((m) => m.topicId === id)),
  ]);
  const themes = notes.filter((n) => n.kind === "theme");
  const characters = notes.filter((n) => n.kind === "character");

  return (
    <>
      <div className="page-head">
        <div>
          <p className="muted small">
            <Link href={`/subjects/${subject.slug}`}>{subject.name}</Link> · {topic.groupName}
          </p>
          <h1 className="row">
            <StatusChip status={topic.status} /> {topic.name}
          </h1>
        </div>
        <StatusButtons topicId={topic.id} status={topic.status} back={back} />
      </div>

      {topic.archived && <p className="notice">You&apos;ve marked this as &quot;not studying&quot;, so it&apos;s left out of plans and grades.</p>}

      <div className="grid">
        <section className="card">
          <h2>Where it stands</h2>
          <ul className="list small">
            <li>
              <span>Status</span>
              <span>{STATUS_NAME[topic.status]}</span>
            </li>
            <li>
              <span>Last reviewed</span>
              <span>{topic.lastReviewed ? formatDate(topic.lastReviewed) : "Never"}</span>
            </li>
            <li>
              <span>Next review</span>
              <span>
                {topic.nextReview
                  ? `${formatDate(topic.nextReview)} (${relativeDays(daysBetween(core.today, topic.nextReview))})`
                  : "As soon as possible"}
              </span>
            </li>
            <li>
              <span>Paper</span>
              <span>{topic.paper || "—"}</span>
            </li>
          </ul>
          <p className="small muted">
            Spaced repetition: red comes back in 2 days, amber in 5, green in 14 (then 21 for a cold retest).
          </p>
        </section>

        {priority && (
          <section className="card">
            <h2>Priority {priority.score.toFixed(1)}</h2>
            <ul className="list small">
              <li>
                <span>Marks weighting</span>
                <span className="num">×{priority.marks.toFixed(2)}</span>
              </li>
              <li>
                <span>Weakness ({STATUS_NAME[topic.status].toLowerCase()})</span>
                <span className="num">×{priority.weakness.toFixed(2)}</span>
              </li>
              <li>
                <span>
                  Urgency {priority.daysToExam !== null ? `(next exam ${relativeDays(priority.daysToExam)})` : ""}
                </span>
                <span className="num">×{priority.urgency.toFixed(2)}</span>
              </li>
              <li>
                <span>Spaced repetition ({priority.review < 1 ? "not due yet" : "due"})</span>
                <span className="num">×{priority.review.toFixed(2)}</span>
              </li>
              {priority.test > 1 && (
                <li>
                  <span>Class test coming up</span>
                  <span className="num">×{priority.test.toFixed(2)}</span>
                </li>
              )}
            </ul>
            <p className="small muted">
              Marks weighting is 1 for an average topic in {subject.name}. Today&apos;s plan picks the highest scores.
            </p>
          </section>
        )}
      </div>

      {topic.isSetText && (
        <>
          <section className="card">
            <div className="card-head">
              <h2>Key quotes ({quotes.length})</h2>
              {quotes.length > 0 && (
                <Link className="btn small" href={`/quiz?topic=${topic.id}`}>
                  Quiz me
                </Link>
              )}
            </div>
            <form action={addQuote} className="form-grid">
              <input type="hidden" name="topicId" value={topic.id} />
              <input type="hidden" name="back" value={back} />
              <label className="full">
                Quote
                <textarea name="text" required placeholder="Type the quote exactly" />
              </label>
              <label>
                Theme
                <input name="theme" list="themes" />
                <datalist id="themes">
                  {themes.map((t) => (
                    <option key={t.id} value={t.name} />
                  ))}
                </datalist>
              </label>
              <label>
                Character
                <input name="character" list="characters" />
                <datalist id="characters">
                  {characters.map((c) => (
                    <option key={c.id} value={c.name} />
                  ))}
                </datalist>
              </label>
              <div className="full">
                <SubmitButton>Add quote</SubmitButton>
              </div>
            </form>
            <ul className="list">
              {quotes.map((q) => (
                <li key={q.id}>
                  <div className="grow">
                    <div style={{ fontFamily: "Georgia, serif" }}>&ldquo;{q.text}&rdquo;</div>
                    <div className="small muted">
                      {[q.character, q.theme].filter(Boolean).join(" · ") || "No theme or character"}
                      {q.timesQuizzed > 0 && ` · quiz ${q.timesCorrect}/${q.timesQuizzed}`}
                    </div>
                  </div>
                  <form action={deleteQuote}>
                    <input type="hidden" name="id" value={q.id} />
                    <input type="hidden" name="back" value={back} />
                    <button className="btn link" aria-label="Delete quote">
                      ✕
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          </section>

          <div className="grid">
            {(["theme", "character"] as const).map((kind) => {
              const list = kind === "theme" ? themes : characters;
              return (
                <section key={kind} className="card">
                  <h2>{kind === "theme" ? "Themes" : "Characters"}</h2>
                  <ul className="list small">
                    {list.map((n) => (
                      <li key={n.id}>
                        <div className="grow">
                          <strong>{n.name}</strong>
                          {n.notes && <div className="dim">{n.notes}</div>}
                          <div className="muted">
                            {plural(quotes.filter((q) => (kind === "theme" ? q.theme : q.character) === n.name).length, "quote")}
                          </div>
                        </div>
                        <form action={deleteTextNote}>
                          <input type="hidden" name="id" value={n.id} />
                          <input type="hidden" name="back" value={back} />
                          <button className="btn link" aria-label="Delete">
                            ✕
                          </button>
                        </form>
                      </li>
                    ))}
                  </ul>
                  <form action={addTextNote} className="stack">
                    <input type="hidden" name="topicId" value={topic.id} />
                    <input type="hidden" name="kind" value={kind} />
                    <input type="hidden" name="back" value={back} />
                    <input name="name" required placeholder={kind === "theme" ? "Theme, e.g. Power" : "Character name"} />
                    <textarea name="notes" placeholder="Notes (optional)" />
                    <SubmitButton className="btn ghost small">Add {kind}</SubmitButton>
                  </form>
                </section>
              );
            })}
          </div>
        </>
      )}

      <div className="grid">
        <section className="card">
          <h2>History</h2>
          {reviews.length === 0 ? (
            <p className="muted small">Not rated yet.</p>
          ) : (
            <ul className="list small">
              {reviews.map((r) => (
                <li key={r.id}>
                  <span>{formatDate(r.date)}</span>
                  <StatusChip status={r.status} />
                </li>
              ))}
            </ul>
          )}
          {mistakes.length > 0 && (
            <>
              <h3>Mistakes logged here</h3>
              <ul className="list small">
                {mistakes.map((m) => (
                  <li key={m.id}>
                    <span className="grow">{m.errorType}</span>
                    <span className="muted">{formatDate(m.date)}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        <section className="card">
          <h2>Edit</h2>
          <form action={updateTopic} className="form-grid">
            <input type="hidden" name="topicId" value={topic.id} />
            <input type="hidden" name="back" value={back} />
            <label className="full">
              Name {topic.isSetText && <span className="muted">(e.g. put your set text&apos;s title here)</span>}
              <input name="name" defaultValue={topic.name} required />
            </label>
            <label>
              Group
              <input name="group" defaultValue={topic.groupName} />
            </label>
            <label>
              Marks weight
              <input name="weight" type="number" step="0.1" min="0.1" defaultValue={Math.round(topic.weight * 10) / 10} />
            </label>
            <div className="full">
              <SubmitButton>Save</SubmitButton>
            </div>
          </form>
          <form action={setTopicArchived} className="spread">
            <input type="hidden" name="topicId" value={topic.id} />
            <input type="hidden" name="archived" value={String(!topic.archived)} />
            <input type="hidden" name="back" value={back} />
            <span className="small muted">
              {topic.archived ? "Bring it back into your plans." : "Not on your course (e.g. a Geography option you don't take)?"}
            </span>
            <SubmitButton className="btn ghost small">{topic.archived ? "I study this" : "I don't study this"}</SubmitButton>
          </form>
        </section>
      </div>
    </>
  );
}
