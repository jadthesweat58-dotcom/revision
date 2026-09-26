import Link from "next/link";
import { LETTER, STATUS_NAME } from "@/components/Status";
import { loadCore, loadScores } from "@/lib/data";
import { formatGrade, workingGrade } from "@/lib/grades";
import type { Status } from "@/lib/types";

export default async function SubjectsPage() {
  const core = await loadCore();
  const scores = await loadScores();

  const counts: Record<Status, number> = { red: 0, amber: 0, green: 0, unrated: 0 };
  for (const t of core.topics) counts[t.status]++;

  return (
    <>
      <div className="page-head">
        <h1>Subjects</h1>
        <div className="legend">
          {(["red", "amber", "green", "unrated"] as const).map((s) => (
            <span key={s}>
              <span className={`chip ${s}`}>{LETTER[s]}</span> {STATUS_NAME[s]} ({counts[s]})
            </span>
          ))}
        </div>
      </div>

      {core.subjects.map((subject) => {
        const topics = core.topics.filter((t) => t.subjectId === subject.id);
        const estimate = workingGrade(subject, scores, topics, core.today);
        return (
          <section key={subject.id} className="card">
            <div className="card-head">
              <Link href={`/subjects/${subject.slug}`}>
                <h2>{subject.name} ›</h2>
              </Link>
              <span className="small dim">
                Working grade {formatGrade(estimate.grade)} · target {subject.targetGrade}
                {subject.stretchGrade ? `–${subject.stretchGrade}` : ""}
              </span>
            </div>
            <div className="tiles">
              {topics.map((t) => (
                <Link key={t.id} href={`/topics/${t.id}`} className={`tile ${t.status}`} title={`${t.name} — ${STATUS_NAME[t.status]}`}>
                  <span className="letter">{LETTER[t.status]}</span>
                  <span>{t.name}</span>
                </Link>
              ))}
            </div>
          </section>
        );
      })}
    </>
  );
}
