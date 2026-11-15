import { isActionable, waitsOnMe, type Capture } from "./models";

/** Local midnight `daysAgo` days before the day containing `now`. Safe across clock changes. */
export function dayStart(now: number, daysAgo = 0): number {
  const date = new Date(now);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() - daysAgo).getTime();
}

export interface OverviewStats {
  /** Open commitments and asks of David. */
  waitingOnMe: number;
  /** Open asks David made of others. */
  waitingOnOthers: number;
  /** Wins captured in the last 30 days. */
  recentWins: number;
  /** Captures in the last 7 days, today included. */
  capturedThisWeek: number;
  /** Captures in the 7 days before that. */
  capturedLastWeek: number;
  /** Items waiting on David that he closed in the last 7 days. */
  clearedThisWeek: number;
  /** clearedThisWeek plus what is still waiting. */
  clearTotal: number;
  /** Captures per day for the last 14 days, oldest first. */
  dailyCaptures: number[];
  /** Open items waiting on David, oldest first. */
  waitingList: Capture[];
}

export function overviewStats(captures: Capture[], now: number): OverviewStats {
  const weekStart = dayStart(now, 6);
  const lastWeekStart = dayStart(now, 13);
  const monthStart = dayStart(now, 29);

  const waitingList = captures
    .filter((capture) => waitsOnMe(capture.kind) && capture.doneAt === null)
    .sort((a, b) => a.createdAt - b.createdAt);
  const clearedThisWeek = captures.filter(
    (capture) => waitsOnMe(capture.kind) && capture.doneAt !== null && capture.doneAt >= weekStart,
  ).length;

  const dailyCaptures = Array.from({ length: 14 }, () => 0);
  for (const capture of captures) {
    for (let index = 0; index < 14; index++) {
      if (capture.createdAt >= dayStart(now, 13 - index) && capture.createdAt < dayStart(now, 12 - index)) {
        dailyCaptures[index]++;
      }
    }
  }

  return {
    waitingOnMe: waitingList.length,
    waitingOnOthers: captures.filter((capture) => capture.kind === "ask_of_them" && capture.doneAt === null).length,
    recentWins: captures.filter((capture) => capture.isWin && capture.createdAt >= monthStart).length,
    capturedThisWeek: captures.filter((capture) => capture.createdAt >= weekStart).length,
    capturedLastWeek: captures.filter((capture) => capture.createdAt >= lastWeekStart && capture.createdAt < weekStart)
      .length,
    clearedThisWeek,
    clearTotal: clearedThisWeek + waitingList.length,
    dailyCaptures,
    waitingList,
  };
}

export const RANGES = [
  { id: "7d", label: "7 days", buckets: 7, daysPerBucket: 1 },
  { id: "30d", label: "30 days", buckets: 30, daysPerBucket: 1 },
  { id: "13w", label: "13 weeks", buckets: 13, daysPerBucket: 7 },
] as const;

export type RangeId = (typeof RANGES)[number]["id"];

export interface Bucket {
  /** Local midnight of the bucket's first day. */
  start: number;
  /** Local midnight after the bucket's last day. */
  end: number;
  captured: number;
}

export interface AnalyticsStats {
  buckets: Bucket[];
  captured: number;
  /** Commitments and asks marked done in the period, whenever they were captured. */
  closed: number;
  wins: number;
  /** Commitments and asks captured in the period and not yet done. */
  stillOpen: number;
}

export function analyticsStats(captures: Capture[], rangeId: RangeId, now: number): AnalyticsStats {
  const range = RANGES.find((candidate) => candidate.id === rangeId)!;
  const buckets: Bucket[] = [];
  for (let index = 0; index < range.buckets; index++) {
    const lastDayAgo = (range.buckets - 1 - index) * range.daysPerBucket;
    buckets.push({
      start: dayStart(now, lastDayAgo + range.daysPerBucket - 1),
      end: dayStart(now, lastDayAgo - 1),
      captured: 0,
    });
  }
  const from = buckets[0].start;
  const to = buckets[buckets.length - 1].end;
  const inRange = (time: number | null) => time !== null && time >= from && time < to;

  const captured = captures.filter((capture) => inRange(capture.createdAt));
  for (const capture of captured) {
    const bucket = buckets.find((candidate) => capture.createdAt >= candidate.start && capture.createdAt < candidate.end);
    if (bucket) bucket.captured++;
  }

  return {
    buckets,
    captured: captured.length,
    closed: captures.filter((capture) => isActionable(capture.kind) && inRange(capture.doneAt)).length,
    wins: captured.filter((capture) => capture.isWin).length,
    stillOpen: captured.filter((capture) => isActionable(capture.kind) && capture.doneAt === null).length,
  };
}

/** Axis ticks from 0 to a round number at or above `max`. */
export function axisTicks(max: number): number[] {
  if (max <= 4) return Array.from({ length: Math.max(max, 1) + 1 }, (_, index) => index);
  const rough = max / 4;
  const power = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 5, 10].map((factor) => factor * power).find((candidate) => candidate >= rough)!;
  const ticks: number[] = [];
  for (let tick = 0; tick < max + step; tick += step) ticks.push(tick);
  return ticks;
}
