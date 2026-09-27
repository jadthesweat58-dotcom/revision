// Changes shared by the app's forms and the connector (Claude chats, Jarvis).

import type { Sql } from "./db";
import { userToday } from "./data";
import { nextReviewDate } from "./revision";
import type { Status } from "./types";

/** Today's plan is rebuilt next time it's viewed (e.g. after new homework arrives). */
export async function clearTodaysPlan(sql: Sql) {
  await sql`delete from daily_plans where date = ${await userToday(sql)}`;
}

/**
 * Rates a topic red / amber / green and schedules its next review
 * (2 / 5 / 14–21 days). `reviewBy` can bring the next review forward.
 */
export async function rateTopic(
  sql: Sql,
  topicId: number,
  status: Status,
  sessionId: number | null = null,
  reviewBy: string | null = null,
) {
  const today = await userToday(sql);
  const [topic] = await sql<{ status: Status }[]>`select status from topics where id = ${topicId}`;
  if (!topic) return null;
  let next = nextReviewDate(status, topic.status, today);
  if (reviewBy && reviewBy >= today && reviewBy < next) next = reviewBy;
  await sql`update topics set status = ${status}, last_reviewed = ${today}, next_review = ${next}
            where id = ${topicId}`;
  await sql`insert into topic_reviews (topic_id, session_id, date, status)
            values (${topicId}, ${sessionId}, ${today}, ${status})`;
  return next;
}
