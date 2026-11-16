import { dayStart } from "./insights";
import type { Capture } from "./models";

const DAY = 86_400_000;

/** Turns a date field's value ("2026-11-20") into the end of that day, local time. */
export function dueFromDateInput(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 23, 59, 59).getTime();
}

/** The reverse: a due time back to a date field's value. */
export function dateInputFromDue(dueAt: number | null): string {
  if (dueAt === null) return "";
  const date = new Date(dueAt);
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export interface TrackedCommitment {
  capture: Capture;
  /** Whole days past the promised date, or 0 if not late or undated. */
  slippedDays: number;
  /** Whole days until the promised date (0 = today), or null if late or undated. */
  dueInDays: number | null;
}

export interface CommitmentBoard {
  /** What David promised or was asked for. */
  mine: TrackedCommitment[];
  /** What others promised David. */
  theirs: TrackedCommitment[];
  /** How many of all of them have slipped. */
  slipped: number;
}

function track(capture: Capture, now: number): TrackedCommitment {
  if (capture.dueAt === null) return { capture, slippedDays: 0, dueInDays: null };
  const dueDay = dayStart(capture.dueAt);
  const today = dayStart(now);
  const days = Math.round((dueDay - today) / DAY);
  return days < 0 ? { capture, slippedDays: -days, dueInDays: null } : { capture, slippedDays: 0, dueInDays: days };
}

/** Slipped first (most overdue on top), then by soonest due date, then undated by age. */
function order(a: TrackedCommitment, b: TrackedCommitment): number {
  if (a.slippedDays !== b.slippedDays) return b.slippedDays - a.slippedDays;
  if (a.dueInDays !== null && b.dueInDays !== null) return a.dueInDays - b.dueInDays;
  if (a.dueInDays !== null) return -1;
  if (b.dueInDays !== null) return 1;
  return a.capture.createdAt - b.capture.createdAt;
}

/** Every open promise in both directions, with the ones that have slipped flagged. */
export function commitmentBoard(captures: Capture[], now: number): CommitmentBoard {
  const open = captures.filter((capture) => capture.doneAt === null);
  const mine = open
    .filter((capture) => capture.kind === "commitment" || capture.kind === "ask_of_me")
    .map((capture) => track(capture, now))
    .sort(order);
  const theirs = open
    .filter((capture) => capture.kind === "ask_of_them")
    .map((capture) => track(capture, now))
    .sort(order);
  return { mine, theirs, slipped: [...mine, ...theirs].filter((entry) => entry.slippedDays > 0).length };
}
