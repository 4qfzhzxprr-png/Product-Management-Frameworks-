import { nextMeetingWith, type CalendarEventRecord } from "./calendar";
import type { Db } from "./db";
import { dayStart } from "./insights";
import { isNamed, type Capture, type Person } from "./models";
import { epicHealth, HEALTH_LABELS, type WorkItem } from "./work";

/** Leading the PM team: 1:1 cadence, praise, review prep and time off. */

const DAY = 86_400_000;

export interface Cadence {
  person: Person;
  /** The latest 1:1 note, or null if there has never been one. */
  lastOneOnOne: number | null;
  daysSince: number | null;
  next: CalendarEventRecord | null;
  /** No 1:1 note within the limit and nothing booked in the next three days. */
  overdue: boolean;
}

/** For each PM: when the last 1:1 was, and whether one is overdue. */
export function oneOnOneCadence(pms: Person[], captures: Capture[], meetings: CalendarEventRecord[], now: number, limitDays = 14): Cadence[] {
  return pms.map((person) => {
    const last = captures
      .filter((capture) => capture.personId === person.id && capture.kind === "one_on_one")
      .reduce<number | null>((latest, capture) => (latest === null || capture.createdAt > latest ? capture.createdAt : latest), null);
    const daysSince = last === null ? null : Math.floor((dayStart(now) - dayStart(last)) / DAY);
    const next = nextMeetingWith(person, meetings, now);
    const bookedSoon = next !== null && next.startsAt - now < 3 * DAY;
    return { person, lastOneOnOne: last, daysSince, next, overdue: !bookedSoon && (daysSince === null || daysSince > limitDays) };
  });
}

/** Days since the last praise or win about this person, or null if there has never been one. */
export function daysSincePraise(person: Person, captures: Capture[], now: number): number | null {
  const last = captures
    .filter((capture) => capture.personId === person.id && capture.isWin)
    .reduce<number | null>((latest, capture) => (latest === null || capture.createdAt > latest ? capture.createdAt : latest), null);
  return last === null ? null : Math.floor((dayStart(now) - dayStart(last)) / DAY);
}

// ---------- Review and promotion prep ----------

export interface ReviewPacket {
  person: Person;
  from: number;
  to: number;
  wins: Capture[];
  feedback: Capture[];
  oneOnOnes: Capture[];
  /** What they were asked for and delivered. */
  delivered: Capture[];
  /** What they still owe. */
  open: Capture[];
  epics: { title: string; health: string; done: number; total: number }[];
}

/** Everything the app holds about one person over a period, for a review or promotion case. */
export function reviewPacket(person: Person, captures: Capture[], work: WorkItem[], now: number, months: number): ReviewPacket {
  const fromDate = new Date(now);
  const from = new Date(fromDate.getFullYear(), fromDate.getMonth() - months, fromDate.getDate()).getTime();
  const theirs = captures.filter((capture) => capture.personId === person.id && capture.createdAt >= from && capture.createdAt <= now);
  const byDate = (a: Capture, b: Capture) => a.createdAt - b.createdAt;
  return {
    person,
    from,
    to: now,
    wins: theirs.filter((capture) => capture.isWin).sort(byDate),
    feedback: theirs.filter((capture) => capture.kind === "feedback" && !capture.isWin).sort(byDate),
    oneOnOnes: theirs.filter((capture) => capture.kind === "one_on_one").sort(byDate),
    delivered: theirs.filter((capture) => capture.kind === "ask_of_them" && capture.doneAt !== null).sort(byDate),
    open: theirs.filter((capture) => capture.kind === "ask_of_them" && capture.doneAt === null).sort(byDate),
    epics: epicHealth(work, now)
      .filter((entry) => isNamed(person, entry.epic.ownerName))
      .map((entry) => ({ title: entry.epic.title, health: HEALTH_LABELS[entry.health], done: entry.done, total: entry.total })),
  };
}

const date = (time: number) => new Date(time).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

/** The packet as plain text: to copy, or to send to Claude for a first draft. */
export function reviewPacketText(packet: ReviewPacket): string {
  const list = (items: Capture[], empty: string) => (items.length ? items.map((item) => `- ${date(item.createdAt)}: ${item.body.replace(/\n+/g, " ")}`).join("\n") : `- ${empty}`);
  return [
    `${packet.person.name}: ${date(packet.from)} to ${date(packet.to)}`,
    "",
    "Wins and praise",
    list(packet.wins, "None recorded."),
    "",
    "Feedback",
    list(packet.feedback, "None recorded."),
    "",
    "Delivered when asked",
    list(packet.delivered, "None recorded."),
    "",
    "Still open",
    list(packet.open, "Nothing."),
    "",
    "Epics they own",
    packet.epics.length ? packet.epics.map((epic) => `- ${epic.title}: ${epic.health}, ${epic.done} of ${epic.total} done`).join("\n") : "- None in the tracker.",
    "",
    "1:1 notes",
    list(packet.oneOnOnes, "None."),
  ].join("\n");
}

export const REVIEW_SYSTEM = `You help a product leader write a fair, specific performance review or promotion case for one of their product managers.
Use only the evidence given. Do not invent achievements, numbers or quotes.
Write in plain English, in these sections: Summary (3 sentences), Strengths with examples, Growth areas with examples, Suggested goals for the next period.
Where the evidence is thin, say so rather than filling the gap.`;

// ---------- Time off ----------

export interface TimeOff {
  id: number;
  /** A person, or null for a whole team (a public holiday). */
  personId: number | null;
  /** For a whole team: its name as the tracker uses it, such as "Offshore". */
  team: string;
  startsAt: number;
  /** The last day off, as the end of that day. */
  endsAt: number;
  note: string;
}

export function describeTimeOff(entry: TimeOff, people: Person[]): string {
  const who = entry.personId !== null ? (people.find((person) => person.id === entry.personId)?.name ?? "Someone") : `${entry.team || "Everyone"} (holiday)`;
  const short = (time: number) => new Date(time).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const same = dayStart(entry.startsAt) === dayStart(entry.endsAt);
  return `${who}: ${same ? short(entry.startsAt) : `${short(entry.startsAt)} to ${short(entry.endsAt)}`}${entry.note ? ` · ${entry.note}` : ""}`;
}

/** Time off that overlaps a period. */
export function offDuring(entries: TimeOff[], from: number, to: number): TimeOff[] {
  return entries.filter((entry) => entry.startsAt <= to && entry.endsAt >= from).sort((a, b) => a.startsAt - b.startsAt);
}

/** Working days (Monday to Friday) between two dates, both included. */
export function workingDays(from: number, to: number): number {
  let count = 0;
  for (let time = dayStart(from); time <= to; time += DAY) {
    const day = new Date(time).getDay();
    if (day >= 1 && day <= 5) count++;
  }
  return count;
}

interface TimeOffRow {
  id: number;
  person_id: number | null;
  team: string;
  starts_at: number;
  ends_at: number;
  note: string;
}

export class TimeOffStore {
  constructor(private readonly db: Db) {}

  async list(): Promise<TimeOff[]> {
    const rows = await this.db.all<TimeOffRow>("SELECT * FROM time_off ORDER BY starts_at");
    return rows.map((row) => ({ id: row.id, personId: row.person_id, team: row.team, startsAt: row.starts_at, endsAt: row.ends_at, note: row.note }));
  }

  async add(entry: Omit<TimeOff, "id">): Promise<number> {
    if (entry.endsAt < entry.startsAt) throw new Error("Time off cannot end before it starts.");
    const { lastInsertId } = await this.db.run("INSERT INTO time_off (person_id, team, starts_at, ends_at, note) VALUES (?, ?, ?, ?, ?)", [
      entry.personId,
      entry.team.trim(),
      entry.startsAt,
      entry.endsAt,
      entry.note.trim(),
    ]);
    return lastInsertId;
  }

  async remove(id: number): Promise<void> {
    await this.db.run("DELETE FROM time_off WHERE id = ?", [id]);
  }
}

export const LEADING_TABLES = [
  `CREATE TABLE IF NOT EXISTS time_off (
     id INTEGER PRIMARY KEY,
     person_id INTEGER REFERENCES people(id) ON DELETE CASCADE,
     team TEXT NOT NULL DEFAULT '',
     starts_at INTEGER NOT NULL,
     ends_at INTEGER NOT NULL,
     note TEXT NOT NULL DEFAULT ''
   )`,
];

