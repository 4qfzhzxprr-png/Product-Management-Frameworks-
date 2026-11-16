import { describe, expect, it } from "vitest";
import { commitmentBoard, dateInputFromDue, dueFromDateInput } from "./commitments";
import type { Capture, CaptureKind } from "./models";

const NOW = new Date(2026, 10, 18, 15).getTime();
const endOf = (daysFromNow: number) => new Date(2026, 10, 18 + daysFromNow, 23, 59, 59).getTime();

let nextId = 1;
function capture(kind: CaptureKind, body: string, extra: Partial<Capture> = {}): Capture {
  return {
    id: nextId++, createdAt: NOW - nextId * 1000, kind, body, personId: null, projectId: null,
    isWin: false, doneAt: null, dueAt: null, ...extra,
  };
}

describe("date field helpers", () => {
  it("round-trips a date and treats it as the end of that local day", () => {
    const due = dueFromDateInput("2026-11-20");
    expect(due).toBe(new Date(2026, 10, 20, 23, 59, 59).getTime());
    expect(dateInputFromDue(due)).toBe("2026-11-20");
    expect(dueFromDateInput("")).toBeNull();
    expect(dateInputFromDue(null)).toBe("");
  });
});

describe("commitmentBoard", () => {
  const board = commitmentBoard(
    [
      capture("commitment", "no date, older", { createdAt: NOW - 9000 }),
      capture("commitment", "no date, newer", { createdAt: NOW - 100 }),
      capture("commitment", "due today", { dueAt: endOf(0) }),
      capture("ask_of_me", "due in 3", { dueAt: endOf(3) }),
      capture("commitment", "slipped 1", { dueAt: endOf(-1) }),
      capture("ask_of_me", "slipped 5", { dueAt: endOf(-5) }),
      capture("commitment", "done late", { dueAt: endOf(-5), doneAt: NOW }),
      capture("ask_of_them", "theirs slipped", { dueAt: endOf(-2) }),
      capture("ask_of_them", "theirs later", { dueAt: endOf(6) }),
      capture("note", "not a promise", { dueAt: endOf(-2) }),
    ],
    NOW,
  );

  it("puts slipped promises first, then soonest due, then undated by age", () => {
    expect(board.mine.map((entry) => entry.capture.body)).toEqual([
      "slipped 5", "slipped 1", "due today", "due in 3", "no date, older", "no date, newer",
    ]);
  });

  it("says how late or how soon each one is", () => {
    const byBody = Object.fromEntries(board.mine.map((entry) => [entry.capture.body, entry]));
    expect(byBody["slipped 5"]).toMatchObject({ slippedDays: 5, dueInDays: null });
    expect(byBody["due today"]).toMatchObject({ slippedDays: 0, dueInDays: 0 });
    expect(byBody["due in 3"]).toMatchObject({ slippedDays: 0, dueInDays: 3 });
    expect(byBody["no date, older"]).toMatchObject({ slippedDays: 0, dueInDays: null });
  });

  it("tracks what others promised and counts everything slipped", () => {
    expect(board.theirs.map((entry) => entry.capture.body)).toEqual(["theirs slipped", "theirs later"]);
    expect(board.slipped).toBe(3);
  });
});
