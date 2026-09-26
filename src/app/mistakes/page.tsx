import Link from "next/link";
import { deleteMistake } from "../actions";
import { MistakeForm } from "../log/LogForms";
import { loadCore, loadMistakes, subjectName } from "@/lib/data";
import { addDays, formatDate } from "@/lib/dates";

export default async function MistakesPage({ searchParams }: PageProps<"/mistakes">) {
  const query = await searchParams;
  const core = await loadCore();
  const subject = core.subjects.find((s) => s.slug === query.subject);
  const period = query.period === "all" ? "all" : "30";
  const since = period === "all" ? "0000-01-01" : addDays(core.today, -30);

  const mistakes = (await loadMistakes(subject?.id)).filter((m) => m.date >= since);
  const counts = new Map<string, number>();
  for (const m of mistakes) counts.set(m.errorType, (counts.get(m.errorType) ?? 0) + 1);
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const top = ranked[0]?.[1] ?? 1;
  const topicName = new Map(core.allTopics.map((t) => [t.id, t.name]));

  const link = (subjectSlug: string | undefined, p: string) => {
    const params = new URLSearchParams();
    if (subjectSlug) params.set("subject", subjectSlug);
    if (p === "all") params.set("period", "all");
    const s = params.toString();
    return `/mistakes${s ? `?${s}` : ""}`;
  };

  const subjects = core.subjects.map(({ id, slug, name, kind }) => ({ id, slug, name, kind }));
  const topics = core.topics.map(({ id, subjectId, name, status }) => ({ id, subjectId, name, status }));

  return (
    <>
      <h1>Mistakes</h1>
      <div className="tabs">
        <Link href={link(undefined, period)} className={!subject ? "active" : ""}>
          All subjects
        </Link>
        {core.subjects.map((s) => (
          <Link key={s.id} href={link(s.slug, period)} className={subject?.id === s.id ? "active" : ""}>
            {s.name}
          </Link>
        ))}
      </div>
      <div className="tabs">
        <Link href={link(subject?.slug, "30")} className={period === "30" ? "active" : ""}>
          Last 30 days
        </Link>
        <Link href={link(subject?.slug, "all")} className={period === "all" ? "active" : ""}>
          All time
        </Link>
      </div>

      <div className="grid">
        <section className="card">
          <h2>Most common</h2>
          {ranked.length === 0 ? (
            <p className="muted">No mistakes logged {period === "30" ? "in the last 30 days" : "yet"}.</p>
          ) : (
            <ul className="list">
              {ranked.map(([type, count], i) => (
                <li key={type}>
                  <div className="grow">
                    <div className="spread">
                      <span>
                        <span className="muted num">{i + 1}.</span> {type}
                      </span>
                      <span className="num">×{count}</span>
                    </div>
                    <div className="bar" style={{ marginTop: 6 }}>
                      <span style={{ width: `${(count / top) * 100}%` }} />
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card">
          <h2>Log a mistake</h2>
          <MistakeForm
            subjects={subjects}
            topics={topics}
            initialSubjectId={subject?.id ?? core.subjects[0].id}
            initialTopicId={null}
            today={core.today}
            back={link(subject?.slug, period)}
          />
        </section>
      </div>

      <section className="card">
        <h2>Recent</h2>
        <ul className="list small">
          {mistakes.slice(0, 40).map((m) => (
            <li key={m.id}>
              <div className="grow">
                <div>{m.errorType}</div>
                <div className="muted">
                  {formatDate(m.date)} · {subjectName(core, m.subjectId)}
                  {m.topicId && ` · ${topicName.get(m.topicId)}`}
                  {m.note && ` · ${m.note}`}
                </div>
              </div>
              <form action={deleteMistake}>
                <input type="hidden" name="id" value={m.id} />
                <input type="hidden" name="back" value={link(subject?.slug, period)} />
                <button className="btn link" aria-label="Delete mistake">
                  ✕
                </button>
              </form>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
