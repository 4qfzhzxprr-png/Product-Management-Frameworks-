import { commitmentBoard } from "./commitments";
import type { Db } from "./db";
import type { Capture } from "./models";
import { instant, wallTime } from "./time";
import type { WorkItem } from "./work";

/** What the handoff window needs to know. Times are "HH:MM" on a 24-hour clock. */
export interface HandoffSettings {
  /** IANA zone names, such as "America/Chicago" and "Asia/Kolkata". */
  myZone: string;
  myStart: string;
  myEnd: string;
  /** Empty until David sets it. */
  offshoreZone: string;
  offshoreStart: string;
  offshoreEnd: string;
  /** The team name the tracker uses for the offshore team. Empty means every team. */
  offshoreTeam: string;
}

export function defaultHandoffSettings(myZone: string): HandoffSettings {
  return {
    myZone,
    myStart: "09:00",
    myEnd: "17:30",
    offshoreZone: "",
    offshoreStart: "09:30",
    offshoreEnd: "18:30",
    offshoreTeam: "Offshore",
  };
}

/** A small key-value store for app settings. The table is created by CaptureStore.open. */
export class SettingsStore {
  constructor(private readonly db: Db) {}

  async get<T>(key: string): Promise<T | null> {
    const rows = await this.db.all<{ value: string }>("SELECT value FROM settings WHERE key = ?", [key]);
    if (rows.length === 0) return null;
    try {
      return JSON.parse(rows[0].value) as T;
    } catch {
      return null;
    }
  }

  async set(key: string, value: unknown): Promise<void> {
    await this.db.run(
      "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      [key, JSON.stringify(value)],
    );
  }
}

function clock(value: string): { hour: number; minute: number } {
  const [hour, minute] = value.split(":").map(Number);
  return { hour: hour || 0, minute: minute || 0 };
}

/** A working day in `zone`: the one that is `dayOffset` days from the zone's own today. */
function workingDay(zone: string, start: string, end: string, now: number, dayOffset: number): [number, number] {
  const today = wallTime(zone, now);
  const at = (time: string, extraDays: number) =>
    instant(zone, { ...today, day: today.day + dayOffset + extraDays, ...clock(time) });
  const from = at(start, 0);
  // An end time earlier than the start means the day runs past midnight.
  const to = at(end, 0) > from ? at(end, 0) : at(end, 1);
  return [from, to];
}

export interface Overlap {
  /** When both teams are at work today, or null if never. */
  window: [number, number] | null;
  myDayEndsAt: number;
  /** When the offshore team next starts work. */
  offshoreStartsAt: number;
  /** True while the offshore team is at work right now. */
  offshoreWorkingNow: boolean;
}

/** Today's shared working hours, and when each side starts and stops. */
export function overlap(settings: HandoffSettings, now: number): Overlap {
  const mine = workingDay(settings.myZone, settings.myStart, settings.myEnd, now, 0);
  const theirDays = [-1, 0, 1, 2].map((offset) =>
    workingDay(settings.offshoreZone, settings.offshoreStart, settings.offshoreEnd, now, offset),
  );

  let window: [number, number] | null = null;
  for (const [from, to] of theirDays) {
    const start = Math.max(from, mine[0]);
    const end = Math.min(to, mine[1]);
    if (end > start && (window === null || end - start > window[1] - window[0])) window = [start, end];
  }

  return {
    window,
    myDayEndsAt: mine[1],
    offshoreStartsAt: theirDays.map(([from]) => from).find((from) => from > now) ?? theirDays[3][0],
    offshoreWorkingNow: theirDays.some(([from, to]) => now >= from && now < to),
  };
}

export interface HandoffItems {
  /** Offshore tickets stuck until product answers. Longest stuck first. */
  answers: WorkItem[];
  /** What David promised that is due today or already late. */
  promised: Capture[];
  /** What David is waiting on from others, to chase in the note. */
  asks: Capture[];
}

/** What should reach the offshore team before David's day ends. */
export function handoffItems(work: WorkItem[], captures: Capture[], settings: HandoffSettings, now: number): HandoffItems {
  const team = settings.offshoreTeam.trim().toLowerCase();
  const board = commitmentBoard(captures, now);
  return {
    answers: work
      .filter((item) => item.level === "item" && item.status !== "done" && item.waitingOnProduct)
      .filter((item) => team === "" || item.team.trim().toLowerCase() === team)
      .sort((a, b) => a.updatedAt - b.updatedAt),
    promised: board.mine.filter((entry) => entry.slippedDays > 0 || entry.dueInDays === 0).map((entry) => entry.capture),
    asks: board.theirs.map((entry) => entry.capture),
  };
}

/** A plain-text starting point for the end-of-day note. David edits it and sends it himself. */
export function draftHandoffNote(items: HandoffItems, now: number): string {
  const date = new Date(now).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
  const lines = [`Handoff for ${date}`, ""];

  lines.push("Answers on what you are blocked on:");
  if (items.answers.length === 0) lines.push("- Nothing is waiting on a product answer.");
  for (const item of items.answers) lines.push(`- ${item.externalId} ${item.title}: [your answer]`);

  if (items.asks.length > 0) {
    lines.push("", "Still needed from your side:");
    for (const ask of items.asks) lines.push(`- ${ask.body}`);
  }

  if (items.promised.length > 0) {
    lines.push("", "From me, as promised:");
    for (const promise of items.promised) lines.push(`- ${promise.body}: [update]`);
  }

  lines.push("", "Anything else:", "- ");
  return lines.join("\n");
}
