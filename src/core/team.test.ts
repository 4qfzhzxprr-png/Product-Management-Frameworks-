import { describe, expect, it } from "vitest";
import type { Capture, CaptureKind, Person } from "./models";
import { teamBoard } from "./team";

const NOW = new Date(2026, 10, 18, 15).getTime();
const daysAgo = (days: number) => new Date(2026, 10, 18 - days, 10).getTime();

let nextId = 1;
function capture(kind: CaptureKind, personId: number | null, createdDaysAgo: number, extra: Partial<Capture> = {}): Capture {
  return {
    id: nextId++,
    createdAt: daysAgo(createdDaysAgo),
    kind,
    body: `${kind} ${createdDaysAgo}`,
    personId,
    projectId: null,
    isWin: false,
    doneAt: null,
    ...extra,
  };
}

const priya: Person = { id: 1, name: "Priya", isPM: true };
const marco: Person = { id: 2, name: "Marco", isPM: true };
const lena: Person = { id: 3, name: "Lena", isPM: false };

describe("teamBoard", () => {
  const captures = [
    capture("ask_of_me", priya.id, 2),
    capture("commitment", priya.id, 5),
    capture("ask_of_me", priya.id, 9, { doneAt: daysAgo(1) }),
    capture("ask_of_them", priya.id, 3),
    capture("one_on_one", priya.id, 8),
    capture("one_on_one", priya.id, 1),
    capture("note", priya.id, 4, { isWin: true }),
    capture("note", priya.id, 50, { isWin: true }),
    capture("ask_of_them", marco.id, 6),
    capture("ask_of_me", lena.id, 1),
    capture("commitment", null, 1),
  ];
  const board = teamBoard([lena, marco, priya], captures, NOW);

  it("has one card per PM, most waiting on me first", () => {
    expect(board.map((card) => card.person.name)).toEqual(["Priya", "Marco"]);
  });

  it("splits open items by direction, oldest first, and leaves out done ones", () => {
    const card = board[0];
    expect(card.needsFromMe.map((item) => item.body)).toEqual(["commitment 5", "ask_of_me 2"]);
    expect(card.waitingOnThem.map((item) => item.body)).toEqual(["ask_of_them 3"]);
  });

  it("finds the latest 1:1 note, recent wins and last capture", () => {
    const card = board[0];
    expect(card.lastOneOnOne?.body).toBe("one_on_one 1");
    expect(card.recentWins).toBe(1);
    expect(card.lastCaptureAt).toBe(daysAgo(1));
  });

  it("handles a PM with almost nothing captured", () => {
    const card = board[1];
    expect(card.needsFromMe).toEqual([]);
    expect(card.lastOneOnOne).toBeNull();
    expect(card.waitingOnThem).toHaveLength(1);
  });

  it("orders PMs with equal load by name and returns nothing without PMs", () => {
    expect(teamBoard([priya, marco], [], NOW).map((card) => card.person.name)).toEqual(["Marco", "Priya"]);
    expect(teamBoard([lena], captures, NOW)).toEqual([]);
  });
});
