import { describe, expect, it } from "vitest";
import { findSubject, findTopic } from "./match";
import { acceptableRedirect, redirectAllowed } from "./oauth";
import { callerName } from "./auth";
import type { Subject, Topic } from "../types";

const subject = (slug: string, name: string, specCode: string): Subject => ({
  id: slug.length, slug, name, board: "", specCode, kind: "standard", targetGrade: 9, stretchGrade: null,
  boundaries: {}, boundaryMax: 100, sortOrder: 0,
});
const subjects = [
  subject("maths", "Maths", "1MA1"),
  subject("english-literature", "English Literature", "4ET1"),
  subject("english-language", "English Language", "4EA1"),
  subject("geography", "Geography", "4GE1"),
];
let id = 1;
const topic = (name: string): Topic => ({
  id: id++, subjectId: 1, name, groupName: "", paper: "", weight: 1, status: "unrated", lastReviewed: null,
  nextReview: null, isSetText: false, archived: false, sortOrder: 0,
});
const mathsTopics = [
  topic("Surds"),
  topic("Standard form"),
  topic("Quadratics: factorising, formula & completing the square"),
  topic("Simultaneous equations (incl. non-linear)"),
  topic("Circle theorems"),
  topic("Sine rule, cosine rule & ½ab sin C"),
];

describe("matching names from Claude or Jarvis", () => {
  it("finds subjects by name, alias or spec code", () => {
    expect(findSubject(subjects, "maths")).toMatchObject({ subject: { slug: "maths" } });
    expect(findSubject(subjects, "Math")).toMatchObject({ subject: { slug: "maths" } });
    expect(findSubject(subjects, "Eng Lit")).toMatchObject({ subject: { slug: "english-literature" } });
    expect(findSubject(subjects, "4EA1")).toMatchObject({ subject: { slug: "english-language" } });
    expect(findSubject(subjects, "english")).toHaveProperty("error");
    expect(findSubject(subjects, "Art")).toHaveProperty("error");
  });

  it("finds topics by exact name, part of the name, or shared words", () => {
    expect(findTopic(mathsTopics, "surds").topic?.name).toBe("Surds");
    expect(findTopic(mathsTopics, "completing the square").topic?.name).toContain("Quadratics");
    expect(findTopic(mathsTopics, "simultaneous equations").topic?.name).toContain("Simultaneous");
    expect(findTopic(mathsTopics, "cosine rule").topic?.name).toContain("Sine rule");
    const miss = findTopic(mathsTopics, "vectors");
    expect(miss.topic).toBeNull();
  });
});

describe("Claude sign-in safety checks", () => {
  it("accepts only https, or http on this computer", () => {
    expect(acceptableRedirect("https://claude.ai/api/mcp/auth_callback")).toBe(true);
    expect(acceptableRedirect("http://localhost:3118/callback")).toBe(true);
    expect(acceptableRedirect("http://evil.example/callback")).toBe(false);
    expect(acceptableRedirect("javascript:alert(1)")).toBe(false);
  });

  it("matches redirect addresses exactly, loopback on any port", () => {
    const registered = ["https://claude.ai/api/mcp/auth_callback", "http://localhost/callback"];
    expect(redirectAllowed(registered, "https://claude.ai/api/mcp/auth_callback")).toBe(true);
    expect(redirectAllowed(registered, "https://claude.ai/api/mcp/other")).toBe(false);
    expect(redirectAllowed(registered, "http://localhost:51234/callback")).toBe(true);
    expect(redirectAllowed(registered, "http://localhost:51234/other")).toBe(false);
  });

  it("turns key names into short source names", () => {
    expect(callerName("Jarvis")).toBe("jarvis");
    expect(callerName("My Jarvis v2!")).toBe("my-jarvis-v2");
  });
});
