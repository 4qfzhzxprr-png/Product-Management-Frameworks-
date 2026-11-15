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
] as const;

export type CaptureKind = (typeof CAPTURE_KINDS)[number];

export const KIND_LABELS: Record<CaptureKind, string> = {
  note: "Note",
  thought: "Thought",
  commitment: "My commitment",
  ask_of_me: "Ask of me",
  ask_of_them: "Ask of them",
  one_on_one: "1:1 note",
};

/** Can be open or done. */
export function isActionable(kind: CaptureKind): boolean {
  return kind === "commitment" || kind === "ask_of_me" || kind === "ask_of_them";
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
  at?: number;
}
