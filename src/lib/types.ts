// Shapes of the data the app works with. Database columns are snake_case;
// the database helper converts them to camelCase automatically.

export type Status = "red" | "amber" | "green" | "unrated";
export type SubjectKind = "standard" | "english_lit" | "english_lang";
export type AssessmentKind = "mock" | "final" | "test";

export interface Subject {
  id: number;
  slug: string;
  name: string;
  board: string;
  specCode: string;
  kind: SubjectKind;
  targetGrade: number;
  stretchGrade: number | null;
  /** Grade -> marks needed, e.g. { "9": 210, "8": 176 } */
  boundaries: Record<string, number>;
  /** Total marks the boundaries are out of (all papers added together). */
  boundaryMax: number;
  sortOrder: number;
}

export interface Topic {
  id: number;
  subjectId: number;
  name: string;
  groupName: string;
  paper: string;
  /** Rough share of the exam marks (only matters relative to other topics in the same subject). */
  weight: number;
  status: Status;
  lastReviewed: string | null;
  nextReview: string | null;
  isSetText: boolean;
  archived: boolean;
  sortOrder: number;
}

export interface Assessment {
  id: number;
  subjectId: number;
  kind: AssessmentKind;
  title: string;
  date: string;
  /** Date still to be confirmed. */
  tbc: boolean;
  topicIds: number[];
  notes: string;
}

export interface Homework {
  id: number;
  subjectId: number | null;
  title: string;
  dueDate: string;
  notes: string;
  done: boolean;
  source: string;
  className: string;
  minutes: number;
  /** Link to open it in Teams (homework synced from Teams). */
  link: string;
}

export interface StudySession {
  id: number;
  subjectId: number;
  date: string;
  minutes: number;
  topicIds: number[];
  wentWell: string;
  struggles: string;
  source: string;
}

export interface AoScore {
  score: number;
  max: number;
}

export interface PaperScore {
  id: number;
  subjectId: number;
  topicId: number | null;
  paper: string;
  score: number;
  maxScore: number;
  date: string;
  kind: string;
  aoScores: Record<string, AoScore> | null;
  notes: string;
}

export interface Mistake {
  id: number;
  subjectId: number;
  topicId: number | null;
  errorType: string;
  note: string;
  date: string;
}

export interface Quote {
  id: number;
  topicId: number;
  text: string;
  theme: string;
  character: string;
  timesQuizzed: number;
  timesCorrect: number;
}

export interface TextNote {
  id: number;
  topicId: number;
  kind: "theme" | "character";
  name: string;
  notes: string;
}

export interface Settings {
  normalHoursMin: number;
  normalHoursMax: number;
  heavyHoursMin: number;
  heavyHoursMax: number;
  /** How many weeks before a mock or final exam count as "heavy" weeks. */
  heavyWeeksBefore: number;
  /** Where you live, so "today" changes at your midnight, e.g. "Asia/Dubai". */
  timeZone: string;
}

export const DEFAULT_SETTINGS: Settings = {
  normalHoursMin: 8,
  normalHoursMax: 12,
  heavyHoursMin: 20,
  heavyHoursMax: 24,
  heavyWeeksBefore: 4,
  timeZone: "Europe/London",
};

export interface PlanItem {
  kind: "topic" | "homework";
  subjectId: number | null;
  topicId?: number;
  homeworkId?: number;
  title: string;
  reason: string;
  minutes: number;
}
