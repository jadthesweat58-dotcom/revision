"use client";

import { useState } from "react";
import { logMistake, logScore, logSession } from "../actions";
import SubmitButton from "@/components/SubmitButton";
import { ASSESSMENT_OBJECTIVES, ERROR_TYPES } from "@/lib/constants";
import type { Status, SubjectKind } from "@/lib/types";

export interface FormSubject {
  id: number;
  slug: string;
  name: string;
  kind: SubjectKind;
}
export interface FormTopic {
  id: number;
  subjectId: number;
  name: string;
  status: Status;
}

interface Props {
  subjects: FormSubject[];
  topics: FormTopic[];
  initialSubjectId: number;
  initialTopicId: number | null;
  today: string;
}

function SubjectSelect({ subjects, value, onChange }: { subjects: FormSubject[]; value: number; onChange: (id: number) => void }) {
  return (
    <label>
      Subject
      <select name="subjectId" value={value} onChange={(e) => onChange(Number(e.target.value))}>
        {subjects.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
    </label>
  );
}

// ---------- Study session ----------

export function SessionForm({ subjects, topics, initialSubjectId, initialTopicId, today }: Props) {
  const [subjectId, setSubjectId] = useState(initialSubjectId);
  const [picked, setPicked] = useState<number[]>(initialTopicId ? [initialTopicId] : []);
  const [minutes, setMinutes] = useState(30);
  const own = topics.filter((t) => t.subjectId === subjectId);

  const toggle = (id: number) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  return (
    <form action={logSession} className="form-grid">
      <input type="hidden" name="back" value="/" />
      <SubjectSelect
        subjects={subjects}
        value={subjectId}
        onChange={(id) => {
          setSubjectId(id);
          setPicked([]);
        }}
      />
      <label>
        Date
        <input type="date" name="date" defaultValue={today} max={today} />
      </label>
      <label>
        Minutes
        <input type="number" name="minutes" min={1} value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} required />
      </label>
      <div className="row full">
        {[15, 30, 45, 60, 90].map((m) => (
          <button type="button" key={m} className={`btn small ${minutes === m ? "" : "ghost"}`} onClick={() => setMinutes(m)}>
            {m} min
          </button>
        ))}
      </div>

      <div className="full stack">
        <span className="small dim">Topics covered — then rate how each one feels now</span>
        <div className="check-grid">
          {own.map((t) => (
            <label key={t.id}>
              <input type="checkbox" name="topicIds" value={t.id} checked={picked.includes(t.id)} onChange={() => toggle(t.id)} />
              <span>{t.name}</span>
            </label>
          ))}
        </div>
      </div>

      {picked.length > 0 && (
        <div className="full stack">
          {picked.map((id) => {
            const topic = topics.find((t) => t.id === id);
            if (!topic) return null;
            return (
              <div key={id} className="spread" style={{ flexWrap: "wrap" }}>
                <span className="small">{topic.name}</span>
                <span className="row">
                  {(["red", "amber", "green"] as const).map((s) => (
                    <label key={s} className="inline">
                      <input type="radio" name={`status_${id}`} value={s} defaultChecked={topic.status === s} required />
                      <span className={`chip ${s}`}>{s[0].toUpperCase()}</span>
                    </label>
                  ))}
                </span>
              </div>
            );
          })}
        </div>
      )}

      <label className="full">
        What went well
        <textarea name="wentWell" />
      </label>
      <label className="full">
        What I struggled with
        <textarea name="struggles" />
      </label>

      <details className="full">
        <summary>Mistakes I made (optional)</summary>
        <div className="check-grid" style={{ marginTop: 8 }}>
          {ERROR_TYPES.map((e) => (
            <label key={e}>
              <input type="checkbox" name="errorTypes" value={e} />
              <span>{e}</span>
            </label>
          ))}
        </div>
      </details>

      <div className="full">
        <SubmitButton>Save session</SubmitButton>
      </div>
    </form>
  );
}

// ---------- Paper / practice score ----------

export function ScoreForm({ subjects, topics, initialSubjectId, today }: Props) {
  const [subjectId, setSubjectId] = useState(initialSubjectId);
  const subject = subjects.find((s) => s.id === subjectId)!;
  const isEnglish = subject.kind !== "standard";
  const aos = isEnglish ? ASSESSMENT_OBJECTIVES[subject.kind as "english_lit" | "english_lang"] : [];

  return (
    <form action={logScore} className="form-grid">
      <input type="hidden" name="back" value={`/subjects/${subject.slug}`} />
      <SubjectSelect subjects={subjects} value={subjectId} onChange={setSubjectId} />
      {isEnglish && (
        <label>
          {subject.kind === "english_lit" ? "Text / section" : "Question type"}
          <select name="topicId" required>
            {topics
              .filter((t) => t.subjectId === subjectId)
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
          </select>
        </label>
      )}
      <label>
        {isEnglish ? "Question / essay (optional)" : "Paper"}
        <input name="paper" placeholder={isEnglish ? "e.g. Macbeth ambition essay" : "e.g. June 2023 Paper 2"} />
      </label>
      <label>
        Type
        <select name="kind" defaultValue={isEnglish ? "practice question" : "past paper"}>
          <option>past paper</option>
          <option>practice question</option>
          <option>essay</option>
          <option>class test</option>
          <option>mock</option>
          <option>homework</option>
        </select>
      </label>
      <label>
        Score
        <input type="number" name="score" step="0.5" min={0} required />
      </label>
      <label>
        Out of
        <input type="number" name="maxScore" step="0.5" min={1} required />
      </label>
      <label>
        Date
        <input type="date" name="date" defaultValue={today} max={today} />
      </label>

      {isEnglish && (
        <div className="full stack">
          <span className="small dim">Marks per assessment objective, if your teacher gave them (leave blank if not)</span>
          {aos.map((ao) => (
            <div key={ao.code} className="form-grid">
              <label>
                {ao.code} score <span className="muted">— {ao.label}</span>
                <input type="number" name={`ao_${ao.code}_score`} step="0.5" min={0} />
              </label>
              <label>
                {ao.code} out of
                <input type="number" name={`ao_${ao.code}_max`} step="0.5" min={0} />
              </label>
            </div>
          ))}
        </div>
      )}

      <label className="full">
        Notes
        <input name="notes" />
      </label>
      <div className="full">
        <SubmitButton>Save score</SubmitButton>
      </div>
    </form>
  );
}

// ---------- Mistake ----------

export function MistakeForm({ subjects, topics, initialSubjectId, initialTopicId, today, back = "/mistakes" }: Props & { back?: string }) {
  const [subjectId, setSubjectId] = useState(initialSubjectId);
  return (
    <form action={logMistake} className="form-grid">
      <input type="hidden" name="back" value={back} />
      <SubjectSelect subjects={subjects} value={subjectId} onChange={setSubjectId} />
      <label>
        Topic (optional)
        <select name="topicId" defaultValue={initialTopicId ?? ""} key={subjectId}>
          <option value="">—</option>
          {topics
            .filter((t) => t.subjectId === subjectId)
            .map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
        </select>
      </label>
      <label>
        Type of mistake
        <select name="errorType">
          {ERROR_TYPES.map((e) => (
            <option key={e}>{e}</option>
          ))}
        </select>
      </label>
      <label>
        …or your own type
        <input name="customErrorType" placeholder="Optional" />
      </label>
      <label>
        Date
        <input type="date" name="date" defaultValue={today} max={today} />
      </label>
      <label className="full">
        Note
        <input name="note" placeholder="What happened?" />
      </label>
      <div className="full">
        <SubmitButton>Save mistake</SubmitButton>
      </div>
    </form>
  );
}
