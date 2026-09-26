import Link from "next/link";
import Quiz from "./Quiz";
import { loadCore } from "@/lib/data";
import { db } from "@/lib/db";
import { pickGaps, pickQuote } from "@/lib/quiz";
import type { Quote } from "@/lib/types";

export default async function QuizPage({ searchParams }: PageProps<"/quiz">) {
  const query = await searchParams;
  const core = await loadCore();
  const topicId = Number(query.topic) || null;
  const sql = await db();
  const quotes = topicId
    ? await sql<Quote[]>`select id, topic_id, text, theme, character, times_quizzed, times_correct
                         from quotes where topic_id = ${topicId}`
    : await sql<Quote[]>`select id, topic_id, text, theme, character, times_quizzed, times_correct from quotes`;
  const topic = core.allTopics.find((t) => t.id === topicId);
  const textNames = Object.fromEntries(core.allTopics.filter((t) => t.isSetText).map((t) => [t.id, t.name]));
  const first = quotes.length > 0 ? pickQuote([...quotes], null) : null;

  return (
    <>
      <div className="page-head">
        <div>
          <p className="muted small">{topic ? <Link href={`/topics/${topic.id}`}>{topic.name}</Link> : "All set texts"}</p>
          <h1>Quote quiz</h1>
        </div>
      </div>
      {!first ? (
        <p className="muted">Add some quotes to a set text first.</p>
      ) : (
        <Quiz quotes={[...quotes]} textNames={textNames} firstQuoteId={first.id} firstGaps={pickGaps(first.text)} />
      )}
    </>
  );
}
