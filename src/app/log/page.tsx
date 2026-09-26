import { deleteSession } from "../actions";
import { MistakeForm, ScoreForm, SessionForm } from "./LogForms";
import { loadCore, subjectName } from "@/lib/data";
import { formatDate } from "@/lib/dates";
import { formatMinutes } from "@/lib/format";

export default async function LogPage({ searchParams }: PageProps<"/log">) {
  const query = await searchParams;
  const core = await loadCore();

  const subjects = core.subjects.map(({ id, slug, name, kind }) => ({ id, slug, name, kind }));
  const topics = core.topics.map(({ id, subjectId, name, status }) => ({ id, subjectId, name, status }));
  const initialSubjectId = core.subjects.find((s) => s.slug === query.subject)?.id ?? core.subjects[0].id;
  const topicParam = Number(query.topic);
  const initialTopicId = topics.some((t) => t.id === topicParam) ? topicParam : null;
  const formProps = { subjects, topics, initialSubjectId, initialTopicId, today: core.today };
  const topicName = new Map(core.allTopics.map((t) => [t.id, t.name]));

  return (
    <>
      <h1>Log</h1>
      <section className="card" id="session">
        <h2>Study session</h2>
        <SessionForm {...formProps} />
      </section>

      <section className="card" id="score">
        <h2>Past paper or practice score</h2>
        <ScoreForm {...formProps} />
      </section>

      <section className="card" id="mistake">
        <h2>Mistake</h2>
        <MistakeForm {...formProps} back="/log" />
      </section>

      <section className="card">
        <h2>Recent sessions</h2>
        <ul className="list small">
          {core.sessions.slice(0, 15).map((s) => (
            <li key={s.id}>
              <div className="grow">
                <div>
                  {subjectName(core, s.subjectId)} · {formatMinutes(s.minutes)}
                  {s.source !== "app" && <span className="badge"> via {s.source}</span>}
                </div>
                <div className="muted">
                  {formatDate(s.date)}
                  {s.topicIds.length > 0 && ` · ${s.topicIds.map((id) => topicName.get(id)).filter(Boolean).join(", ")}`}
                </div>
              </div>
              <form action={deleteSession}>
                <input type="hidden" name="id" value={s.id} />
                <input type="hidden" name="back" value="/log" />
                <button className="btn link" aria-label="Delete session">
                  ✕
                </button>
              </form>
            </li>
          ))}
          {core.sessions.length === 0 && <li className="muted">Nothing logged yet.</li>}
        </ul>
      </section>
    </>
  );
}
