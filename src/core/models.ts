/** What a quick capture is. The actionable kinds can be marked done. */
export const CAPTURE_KINDS = [
  "note",
  "thought",
  /** Something David promised to do. */
  "commitment",
  /** Someone asked David for something. */
  "ask_of_me",
  /** David asked someone for something. */
  "ask_of_them",
  /** A note from a 1:1. */
  "one_on_one",
  /** Something to raise at the next 1:1. Open until it has been discussed. */
  "agenda",
  /** A decision David made or was part of, for the weekly update. */
  "decision",
  /** Something a customer said or did that supports a story: a quote, a renewal, a referral. */
  "evidence",
  /** A number worth quoting, such as "support tickets down 33%". */
  "metric",
] as const;

export type CaptureKind = (typeof CAPTURE_KINDS)[number];

export const KIND_LABELS: Record<CaptureKind, string> = {
  note: "Note",
  thought: "Thought",
  commitment: "My commitment",
  ask_of_me: "Ask of me",
  ask_of_them: "Ask of them",
  one_on_one: "1:1 note",
  agenda: "1:1 topic",
  decision: "Decision",
  evidence: "Customer evidence",
  metric: "Metric",
};

/** Can be open or done. */
export function isActionable(kind: CaptureKind): boolean {
  return kind === "commitment" || kind === "ask_of_me" || kind === "ask_of_them" || kind === "agenda";
}

/** Counts toward the menu bar number while open. */
export function waitsOnMe(kind: CaptureKind): boolean {
  return kind === "commitment" || kind === "ask_of_me";
}

export interface Person {
  id: number;
  name: string;
  /** A product manager on David's team; gets a card on the team board. */
  isPM: boolean;
  /** Other names for the same person in other systems, such as "Priya S." in the tracker. */
  aliases: string[];
}

/** Every name a person goes by, lower case. */
export function namesOf(person: Pick<Person, "name" | "aliases">): string[] {
  return [person.name, ...person.aliases].map((name) => name.trim().toLowerCase()).filter(Boolean);
}

/** True when `name` (such as an epic owner) is one of this person's names. */
export function isNamed(person: Pick<Person, "name" | "aliases">, name: string): boolean {
  return namesOf(person).includes(name.trim().toLowerCase());
}

/** True when any of the person's names appears as whole words in `text`, such as a meeting title. */
export function isMentioned(person: Pick<Person, "name" | "aliases">, text: string): boolean {
  const haystack = ` ${text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ")} `;
  return namesOf(person).some((name) => {
    const needle = name.replace(/[^\p{L}\p{N}]+/gu, " ").trim();
    return needle !== "" && haystack.includes(` ${needle} `);
  });
}

export interface Project {
  id: number;
  name: string;
}

export interface Capture {
  id: number;
  /** Milliseconds since the epoch. */
  createdAt: number;
  kind: CaptureKind;
  body: string;
  personId: number | null;
  projectId: number | null;
  /** Seeds the Phase 4 narrative bank. */
  isWin: boolean;
  /** Milliseconds since the epoch, or null while open. */
  doneAt: number | null;
  /** When it was promised for: the end of that day, local time. Null when no date was given. */
  dueAt: number | null;
}

export interface CaptureFilter {
  personId?: number;
  projectId?: number;
  winsOnly?: boolean;
  /** Actionable captures not yet done. */
  openOnly?: boolean;
  /** Open commitments and asks of David. */
  waitingOnMeOnly?: boolean;
  search?: string;
  limit?: number;
}

export interface NewCapture {
  body: string;
  kind?: CaptureKind;
  personId?: number | null;
  projectId?: number | null;
  isWin?: boolean;
  dueAt?: number | null;
  at?: number;
}
