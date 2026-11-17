import { commitmentBoard } from "./commitments";
import { shippedBetween, weekStart, type RoadmapStatus } from "./leadership";
import { narrativeBank, STORY_LABELS, storyType } from "./influence";
import { KIND_LABELS, type Capture, type Person } from "./models";
import type { WorkItem } from "./work";

/**
 * The Friday wrap-up: what shipped, what got done, what slipped, the wins worth telling, and
 * three priorities for next week. Before Wednesday it looks back at last week instead, so a
 * Monday review still has something to say.
 */

export const WEEKLY_SETTINGS = "weekly";

/** Saved per week, keyed by the week's Monday as "YYYY-MM-DD". */
export interface WeekPlan {
  priorities: string[];
  note: string;
}

export interface WeekReview {
  from: number;
  to: number;
  /** "This week" or "Last week". */
  label: string;
  shipped: { epic: string; items: string[] }[];
  shippedCount: number;
  done: Capture[];
  wins: Capture[];
  decisions: Capture[];
  slipped: { capture: Capture; days: number }[];
  /** Leadership commitments late or at risk. */
  leadership: RoadmapStatus[];
  /** Open promises and asks, oldest first, for picking next week's priorities. */
  open: Capture[];
}

export function weekKey(time: number): string {
  const date = new Date(time);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function weekReview(input: { captures: Capture[]; work: WorkItem[]; roadmap: RoadmapStatus[]; now: number }): WeekReview {
  const { captures, work, now } = input;
  const lookBack = new Date(now).getDay() >= 1 && new Date(now).getDay() <= 2;
  const from = weekStart(now, lookBack ? 1 : 0);
  const to = lookBack ? weekStart(now) : now;
  const inWeek = (time: number | null) => time !== null && time >= from && time < to;
  const shipped = shippedBetween(work, from, to);
  const board = commitmentBoard(captures, now);
  return {
    from,
    to,
    label: lookBack ? "Last week" : "This week",
    shipped: shipped.groups.map((group) => ({ epic: group.epic?.title ?? "Not under an epic", items: group.items.map((item) => item.title) })),
    shippedCount: shipped.count,
    done: captures.filter((capture) => inWeek(capture.doneAt)).sort((a, b) => (b.doneAt ?? 0) - (a.doneAt ?? 0)),
    wins: narrativeBank(captures, {}, now).filter((capture) => inWeek(capture.createdAt)),
    decisions: captures.filter((capture) => capture.kind === "decision" && inWeek(capture.createdAt)),
    slipped: board.mine.filter((entry) => entry.slippedDays > 0).map((entry) => ({ capture: entry.capture, days: entry.slippedDays })),
    leadership: input.roadmap.filter((status) => status.state === "late" || status.state === "at_risk"),
    open: board.mine.map((entry) => entry.capture),
  };
}

const day = (time: number) => new Date(time).toLocaleDateString(undefined, { month: "short", day: "numeric" });

/** The review as text, to keep as a note or paste anywhere. */
export function reviewText(review: WeekReview, plan: WeekPlan, people: Person[]): string {
  const name = (id: number | null) => people.find((person) => person.id === id)?.name;
  const list = (items: string[], empty: string) => (items.length > 0 ? items.map((item) => `- ${item}`).join("\n") : `- ${empty}`);
  const priorities = plan.priorities.map((entry) => entry.trim()).filter(Boolean);
  return [
    `Weekly review, ${day(review.from)} to ${day(review.to - 1)}`,
    "",
    `Shipped (${review.shippedCount})`,
    list(review.shipped.map((group) => `${group.epic}: ${group.items.join("; ")}`), "Nothing finished in the tracker."),
    "",
    "Wins",
    list(review.wins.map((win) => `${STORY_LABELS[storyType(win)!]}: ${win.body}`), "None captured."),
    "",
    "Decisions",
    list(review.decisions.map((decision) => decision.body), "None captured."),
    "",
    "Done",
    list(review.done.map((capture) => `${capture.body} (${KIND_LABELS[capture.kind].toLowerCase()}${name(capture.personId) ? `, ${name(capture.personId)}` : ""})`), "Nothing ticked off."),
    "",
    "Slipped",
    list(
      [
        ...review.slipped.map((entry) => `${entry.capture.body}: ${entry.days} ${entry.days === 1 ? "day" : "days"} late`),
        ...review.leadership.map((status) => `${status.item.title} (to leadership): ${status.reasons[0] ?? status.state}`),
      ],
      "Nothing.",
    ),
    "",
    "Next week's priorities",
    priorities.length > 0 ? priorities.map((entry, index) => `${index + 1}. ${entry}`).join("\n") : "- Not set.",
    ...(plan.note.trim() ? ["", "Notes", plan.note.trim()] : []),
  ].join("\n");
}
