// Matches names sent by Claude chats or Jarvis ("maths", "Eng Lit", "surds")
// to the app's subjects and topics.

import type { Subject, Topic } from "../types";

export function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const SUBJECT_ALIASES: Record<string, string[]> = {
  maths: ["math", "mathematics", "1ma1"],
  biology: ["bio", "1bi0"],
  chemistry: ["chem", "1ch0"],
  physics: ["phys", "1ph0"],
  business: ["business studies", "bus", "1bs0"],
  economics: ["econ", "econs", "4ec1"],
  geography: ["geog", "geo", "4ge1"],
  "english-literature": ["english lit", "eng lit", "literature", "lit", "4et1"],
  "english-language": ["english lang", "eng lang", "language", "lang", "4ea1"],
};

export type SubjectMatch = { subject: Subject } | { error: string };

export function findSubject(subjects: Subject[], name: string): SubjectMatch {
  const wanted = normalise(name);
  const found = subjects.find((s) => {
    const names = [s.slug, s.name, s.specCode, ...(SUBJECT_ALIASES[s.slug] ?? [])].map(normalise);
    return names.includes(wanted);
  });
  if (found) return { subject: found };
  const list = subjects.map((s) => s.name).join(", ");
  if (wanted === "english") return { error: `"English" is two subjects. Use "English Literature" or "English Language".` };
  if (wanted === "science") return { error: `Science is three subjects. Use Biology, Chemistry or Physics.` };
  return { error: `Unknown subject "${name}". Use one of: ${list}.` };
}

const words = (text: string) => normalise(text).split(" ").filter((w) => w.length >= 3);

/** How well two names overlap, from 0 (nothing shared) to 1 (same words). */
function overlap(a: string, b: string): number {
  const wa = new Set(words(a));
  const wb = new Set(words(b));
  if (wa.size === 0 || wb.size === 0) return 0;
  let shared = 0;
  for (const w of wa) if ([...wb].some((x) => x.startsWith(w) || w.startsWith(x))) shared++;
  return shared / Math.min(wa.size, wb.size);
}

export interface TopicMatch {
  topic: Topic | null;
  /** Close names, to help the caller retry when nothing matched. */
  suggestions: string[];
}

/** Finds a topic in one subject by name: exact, then contained, then by shared words. */
export function findTopic(topics: Topic[], name: string): TopicMatch {
  const wanted = normalise(name);
  const byName = (pred: (t: string) => boolean) => topics.find((t) => pred(normalise(t.name)));
  const exact = byName((t) => t === wanted);
  if (exact) return { topic: exact, suggestions: [] };
  const contained = byName((t) => t.includes(wanted) || (wanted.length >= 5 && wanted.includes(t)));
  if (contained) return { topic: contained, suggestions: [] };

  const scored = topics
    .map((t) => ({ t, score: overlap(name, t.name) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  if (scored[0] && scored[0].score >= 0.6 && (scored.length === 1 || scored[0].score > scored[1].score)) {
    return { topic: scored[0].t, suggestions: [] };
  }
  return { topic: null, suggestions: scored.slice(0, 5).map((x) => x.t.name) };
}
