import { describe, expect, it } from "vitest";
import { analyticsStats, axisTicks, dayStart, overviewStats } from "./insights";
import type { Capture, CaptureKind } from "./models";

// Wednesday 18 Nov 2026, 15:00 local time.
const NOW = new Date(2026, 10, 18, 15).getTime();
const daysAgo = (days: number, hour = 10) => new Date(2026, 10, 18 - days, hour).getTime();

let nextId = 1;
function capture(kind: CaptureKind, createdDaysAgo: number, extra: Partial<Capture> = {}): Capture {
  return {
    id: nextId++,
    createdAt: daysAgo(createdDaysAgo),
    kind,
    body: "x",
    personId: null,
    projectId: null,
    isWin: false,
    doneAt: null,
    dueAt: null,
    ...extra,
  };
}

describe("dayStart", () => {
  it("returns local midnight", () => {
    expect(dayStart(NOW)).toBe(new Date(2026, 10, 18).getTime());
    expect(dayStart(NOW, 20)).toBe(new Date(2026, 9, 29).getTime());
  });
});

describe("overviewStats", () => {
  const captures = [
    capture("commitment", 10),
    capture("ask_of_me", 2),
    capture("ask_of_me", 8, { doneAt: daysAgo(1) }),
    capture("commitment", 20, { doneAt: daysAgo(9) }),
    capture("ask_of_them", 3),
    capture("ask_of_them", 3, { doneAt: daysAgo(1) }),
    capture("note", 0, { isWin: true }),
    capture("note", 40, { isWin: true }),
    capture("thought", 6),
    capture("thought", 7),
  ];
  const stats = overviewStats(captures, NOW);

  it("counts what is waiting on me and on others", () => {
    expect(stats.waitingOnMe).toBe(2);
    expect(stats.waitingOnOthers).toBe(1);
    expect(stats.waitingList.map((item) => item.createdAt)).toEqual([daysAgo(10), daysAgo(2)]);
  });

  it("measures items cleared this week against cleared plus waiting", () => {
    expect(stats.clearedThisWeek).toBe(1);
    expect(stats.clearTotal).toBe(3);
  });

  it("compares this week with last week", () => {
    // Last 7 days: days 0, 2, 3, 3, 6. The 7 before: days 7, 8, 10.
    expect(stats.capturedThisWeek).toBe(5);
    expect(stats.capturedLastWeek).toBe(3);
  });

  it("counts recent wins only", () => {
    expect(stats.recentWins).toBe(1);
  });

  it("builds 14 days of daily counts, oldest first", () => {
    expect(stats.dailyCaptures).toHaveLength(14);
    expect(stats.dailyCaptures[13]).toBe(1);
    expect(stats.dailyCaptures[10]).toBe(2);
    expect(stats.dailyCaptures.reduce((sum, count) => sum + count, 0)).toBe(8);
  });
});

describe("analyticsStats", () => {
  const captures = [
    capture("note", 0, { isWin: true }),
    capture("commitment", 3),
    capture("commitment", 6, { doneAt: daysAgo(5) }),
    capture("note", 7),
    capture("ask_of_me", 45, { doneAt: daysAgo(2) }),
    capture("note", 95),
  ];

  it("buckets the last 7 days by day", () => {
    const stats = analyticsStats(captures, "7d", NOW);
    expect(stats.buckets.map((bucket) => bucket.captured)).toEqual([1, 0, 0, 1, 0, 0, 1]);
    expect(stats.buckets[6].start).toBe(dayStart(NOW));
    expect(stats).toMatchObject({ captured: 3, closed: 2, wins: 1, stillOpen: 1 });
  });

  it("covers 30 days", () => {
    const stats = analyticsStats(captures, "30d", NOW);
    expect(stats.buckets).toHaveLength(30);
    expect(stats.captured).toBe(4);
  });

  it("buckets 13 weeks by week, ending today", () => {
    const stats = analyticsStats(captures, "13w", NOW);
    expect(stats.buckets).toHaveLength(13);
    expect(stats.buckets[12].captured).toBe(3);
    expect(stats.buckets[11].captured).toBe(1);
    expect(stats.buckets[12].end).toBe(dayStart(NOW, -1));
    // 95 days ago is outside 91 days.
    expect(stats.captured).toBe(5);
  });
});

describe("axisTicks", () => {
  it("uses whole numbers for small counts", () => {
    expect(axisTicks(0)).toEqual([0, 1]);
    expect(axisTicks(3)).toEqual([0, 1, 2, 3]);
  });

  it("uses round steps that reach the maximum", () => {
    expect(axisTicks(7)).toEqual([0, 2, 4, 6, 8]);
    expect(axisTicks(23)).toEqual([0, 10, 20, 30]);
    expect(axisTicks(40)).toEqual([0, 10, 20, 30, 40]);
  });
});
