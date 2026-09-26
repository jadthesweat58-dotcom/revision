import { addHomework, deleteAssessment, deleteHomework, setHomeworkDone, updateAssessment } from "../actions";
import TestForm from "./TestForm";
import SubmitButton from "@/components/SubmitButton";
import { loadCore, subjectName } from "@/lib/data";
import { daysBetween, formatDate, relativeDays } from "@/lib/dates";
import { KIND_LABEL } from "@/lib/format";

export default async function ComingUpPage() {
  const core = await loadCore();
  const { today } = core;
  const back = "/coming-up";

  const openHomework = core.homework.filter((h) => !h.done);
  const doneHomework = core.homework.filter((h) => h.done).reverse();
  const upcoming = core.assessments.filter((a) => a.date >= today);
  const topicName = new Map(core.allTopics.map((t) => [t.id, t.name]));

  const subjects = core.subjects.map(({ id, slug, name, kind }) => ({ id, slug, name, kind }));
  const topics = core.topics.map(({ id, subjectId, name, status }) => ({ id, subjectId, name, status }));

  return (
    <>
      <h1>Homework &amp; tests</h1>
      <p className="notice small">
        Teams sync comes in the next phase. Once it&apos;s connected, homework from Teams will appear here automatically
        every day. Until then, add things here and they&apos;ll go straight into your daily plan.
      </p>

      <div className="grid">
        <section className="card">
          <h2>Homework</h2>
          <ul className="list">
            {openHomework.length === 0 && <li className="muted">No homework to do.</li>}
            {openHomework.map((h) => {
              const days = daysBetween(today, h.dueDate);
              return (
                <li key={h.id}>
                  <div className="grow">
                    <div>{h.title}</div>
                    <div className="small muted">
                      {subjectName(core, h.subjectId)}
                      {h.className && ` · ${h.className}`} · ~{h.minutes} min
                      {h.source === "teams" && " · from Teams"}
                    </div>
                    {h.notes && <div className="small dim">{h.notes}</div>}
                  </div>
                  <span className={`badge ${days < 0 ? "bad" : days <= 2 ? "warn" : ""}`}>
                    {formatDate(h.dueDate)} · {relativeDays(days)}
                  </span>
                  <form action={setHomeworkDone}>
                    <input type="hidden" name="id" value={h.id} />
                    <input type="hidden" name="done" value="true" />
                    <input type="hidden" name="back" value={back} />
                    <SubmitButton className="btn small ghost">Done</SubmitButton>
                  </form>
                </li>
              );
            })}
          </ul>
          <details>
            <summary>Add homework</summary>
            <form action={addHomework} className="form-grid" style={{ marginTop: 10 }}>
              <input type="hidden" name="back" value={back} />
              <label className="full">
                Title
                <input name="title" required />
              </label>
              <label>
                Subject
                <select name="subjectId" defaultValue="">
                  <option value="">General</option>
                  {core.subjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Due
                <input type="date" name="dueDate" required defaultValue={today} />
              </label>
              <label>
                Minutes it&apos;ll take
                <input type="number" name="minutes" min={5} step={5} defaultValue={30} />
              </label>
              <label className="full">
                Notes
                <input name="notes" />
              </label>
              <div className="full">
                <SubmitButton>Add homework</SubmitButton>
              </div>
            </form>
          </details>
          {doneHomework.length > 0 && (
            <details>
              <summary>Done ({doneHomework.length})</summary>
              <ul className="list small">
                {doneHomework.map((h) => (
                  <li key={h.id}>
                    <span className="grow muted">
                      {h.title} · {subjectName(core, h.subjectId)} · due {formatDate(h.dueDate)}
                    </span>
                    <form action={setHomeworkDone}>
                      <input type="hidden" name="id" value={h.id} />
                      <input type="hidden" name="done" value="false" />
                      <input type="hidden" name="back" value={back} />
                      <button className="btn link">Undo</button>
                    </form>
                    <form action={deleteHomework}>
                      <input type="hidden" name="id" value={h.id} />
                      <input type="hidden" name="back" value={back} />
                      <button className="btn link" aria-label="Delete">
                        ✕
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>

        <section className="card">
          <h2>Add a test, mock or exam</h2>
          <TestForm subjects={subjects} topics={topics} today={today} />
        </section>
      </div>

      <section className="card">
        <h2>Tests, mocks &amp; exams</h2>
        <ul className="list">
          {upcoming.map((a) => {
            const days = daysBetween(today, a.date);
            return (
              <li key={a.id}>
                <div className="grow">
                  <div>
                    {a.title} <span className="badge">{KIND_LABEL[a.kind]}</span> {a.tbc && <span className="badge warn">Date TBC</span>}
                  </div>
                  <div className="small muted">
                    {subjectName(core, a.subjectId)}
                    {a.topicIds.length > 0 && ` · ${a.topicIds.map((id) => topicName.get(id)).filter(Boolean).join(", ")}`}
                  </div>
                  <details className="small">
                    <summary>Edit</summary>
                    <form action={updateAssessment} className="form-grid" style={{ marginTop: 8 }}>
                      <input type="hidden" name="id" value={a.id} />
                      <input type="hidden" name="back" value={back} />
                      <label>
                        Title
                        <input name="title" defaultValue={a.title} />
                      </label>
                      <label>
                        Date
                        <input type="date" name="date" defaultValue={a.date} required />
                      </label>
                      <label className="inline">
                        <input type="checkbox" name="tbc" defaultChecked={a.tbc} /> Date not confirmed
                      </label>
                      <div className="row">
                        <SubmitButton className="btn small">Save</SubmitButton>
                      </div>
                    </form>
                    <form action={deleteAssessment} style={{ marginTop: 6 }}>
                      <input type="hidden" name="id" value={a.id} />
                      <input type="hidden" name="back" value={back} />
                      <button className="btn link">Delete</button>
                    </form>
                  </details>
                </div>
                <span className={`badge ${days <= 7 ? "warn" : ""}`}>
                  {formatDate(a.date)} · {relativeDays(days)}
                </span>
              </li>
            );
          })}
        </ul>
      </section>
    </>
  );
}
