import { setTopicStatus } from "@/app/actions";
import type { Status } from "@/lib/types";

export const LETTER: Record<Status, string> = { red: "R", amber: "A", green: "G", unrated: "–" };
export const STATUS_NAME: Record<Status, string> = {
  red: "Red",
  amber: "Amber",
  green: "Green",
  unrated: "Not rated",
};

/** A small coloured square with a letter, so colour is never the only clue. */
export function StatusChip({ status }: { status: Status }) {
  return (
    <span className={`chip ${status}`} title={STATUS_NAME[status]} aria-label={STATUS_NAME[status]}>
      {LETTER[status]}
    </span>
  );
}

/** Red / Amber / Green buttons that save straight away. */
export function StatusButtons({ topicId, status, back }: { topicId: number; status: Status; back: string }) {
  return (
    <form action={setTopicStatus} className="status-buttons">
      <input type="hidden" name="topicId" value={topicId} />
      <input type="hidden" name="back" value={back} />
      {(["red", "amber", "green"] as const).map((s) => (
        <button
          key={s}
          name="status"
          value={s}
          className={`${s} ${status === s ? "on" : ""}`}
          aria-label={`Mark ${STATUS_NAME[s]}`}
          aria-pressed={status === s}
        >
          {LETTER[s]}
        </button>
      ))}
    </form>
  );
}
