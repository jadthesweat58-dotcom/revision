"use client";

import { useState } from "react";
import { addAssessment } from "../actions";
import SubmitButton from "@/components/SubmitButton";
import type { FormSubject, FormTopic } from "../log/LogForms";

/** Add a class test, mock or exam. Tests can list the topics they cover. */
export default function TestForm({ subjects, topics, today }: { subjects: FormSubject[]; topics: FormTopic[]; today: string }) {
  const [subjectId, setSubjectId] = useState(subjects[0].id);
  const [kind, setKind] = useState("test");
  return (
    <form action={addAssessment} className="form-grid">
      <input type="hidden" name="back" value="/coming-up" />
      <label>
        Subject
        <select name="subjectId" value={subjectId} onChange={(e) => setSubjectId(Number(e.target.value))}>
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        What is it?
        <select name="kind" value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="test">Class test</option>
          <option value="mock">Mock</option>
          <option value="final">Final exam</option>
        </select>
      </label>
      <label>
        Date
        <input type="date" name="date" min={today} required />
      </label>
      <label>
        Title
        <input name="title" placeholder={kind === "test" ? "e.g. Algebra end-of-unit test" : "e.g. Paper 1"} />
      </label>
      <label className="inline full">
        <input type="checkbox" name="tbc" /> Date not confirmed yet
      </label>
      {kind === "test" && (
        <div className="full stack">
          <span className="small dim">Topics it covers (these get boosted in your plan as the test gets closer)</span>
          <div className="check-grid" key={subjectId}>
            {topics
              .filter((t) => t.subjectId === subjectId)
              .map((t) => (
                <label key={t.id}>
                  <input type="checkbox" name="topicIds" value={t.id} />
                  <span>{t.name}</span>
                </label>
              ))}
          </div>
        </div>
      )}
      <div className="full">
        <SubmitButton>Add</SubmitButton>
      </div>
    </form>
  );
}
