"use client";

import { useState } from "react";
import { recordQuizAnswer } from "../actions";
import { pickGaps, pickQuote } from "@/lib/quiz";
import type { Quote } from "@/lib/types";

interface Props {
  quotes: Quote[];
  textNames: Record<number, string>;
  /** The first question is chosen on the server so the page loads without a flicker. */
  firstQuoteId: number;
  firstGaps: number[];
}

export default function Quiz({ quotes, textNames, firstQuoteId, firstGaps }: Props) {
  const [quote, setQuote] = useState(() => quotes.find((q) => q.id === firstQuoteId) ?? quotes[0]);
  const [gaps, setGaps] = useState(firstGaps);
  const [revealed, setRevealed] = useState(false);
  const [score, setScore] = useState({ right: 0, total: 0 });

  function answer(correct: boolean) {
    recordQuizAnswer(quote.id, correct);
    setScore((s) => ({ right: s.right + (correct ? 1 : 0), total: s.total + 1 }));
    const next = pickQuote(quotes, quote.id);
    setQuote(next);
    setGaps(pickGaps(next.text));
    setRevealed(false);
  }

  const words = quote.text.split(/\s+/);

  return (
    <section className="card">
      <div className="spread small muted">
        <span>
          {textNames[quote.topicId]}
          {quote.character && ` · ${quote.character}`}
          {quote.theme && ` · ${quote.theme}`}
        </span>
        <span className="num">
          {score.right}/{score.total} this round
        </span>
      </div>
      <p className="quiz-quote">
        &ldquo;
        {words.map((word, i) => (
          <span key={i}>
            {i > 0 && " "}
            {gaps.includes(i) ? <span className={`quiz-gap ${revealed ? "shown" : ""}`}>{word}</span> : word}
          </span>
        ))}
        &rdquo;
      </p>
      {!revealed ? (
        <button className="btn" onClick={() => setRevealed(true)}>
          Say the missing words, then reveal
        </button>
      ) : (
        <div className="row">
          <button className="btn" onClick={() => answer(true)}>
            I got it
          </button>
          <button className="btn ghost" onClick={() => answer(false)}>
            I missed some
          </button>
        </div>
      )}
    </section>
  );
}
