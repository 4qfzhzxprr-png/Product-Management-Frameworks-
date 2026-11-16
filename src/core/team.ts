import { dayStart } from "./insights";
import type { Capture, Person } from "./models";

/** Everything the team board shows for one product manager, built from captures alone. */
export interface PmCard {
  person: Person;
  /** Open asks they made of David, and David's open commitments to them. Oldest first. */
  needsFromMe: Capture[];
  /** Open asks David made of them. Oldest first. */
  waitingOnThem: Capture[];
  /** Topics to raise at the next 1:1, oldest first. */
  agenda: Capture[];
  /** Every 1:1 note, newest first. */
  oneOnOnes: Capture[];
  /** The most recent 1:1 note. */
  lastOneOnOne: Capture | null;
  /** Wins tagged with them in the last 30 days. */
  recentWins: number;
  /** When anything was last captured about them. */
  lastCaptureAt: number | null;
}

/** One card per PM, those with the most waiting on David first. */
export function teamBoard(people: Person[], captures: Capture[], now: number): PmCard[] {
  const monthStart = dayStart(now, 29);
  const oldestFirst = (a: Capture, b: Capture) => a.createdAt - b.createdAt;

  return people
    .filter((person) => person.isPM)
    .map((person) => {
      const theirs = captures.filter((capture) => capture.personId === person.id);
      const open = theirs.filter((capture) => capture.doneAt === null);
      const oneOnOnes = theirs.filter((capture) => capture.kind === "one_on_one");
      return {
        person,
        needsFromMe: open
          .filter((capture) => capture.kind === "ask_of_me" || capture.kind === "commitment")
          .sort(oldestFirst),
        waitingOnThem: open.filter((capture) => capture.kind === "ask_of_them").sort(oldestFirst),
        agenda: open.filter((capture) => capture.kind === "agenda").sort(oldestFirst),
        oneOnOnes: [...oneOnOnes].sort((a, b) => b.createdAt - a.createdAt),
        lastOneOnOne: oneOnOnes.reduce<Capture | null>(
          (latest, capture) => (latest === null || capture.createdAt > latest.createdAt ? capture : latest),
          null,
        ),
        recentWins: theirs.filter((capture) => capture.isWin && capture.createdAt >= monthStart).length,
        lastCaptureAt: theirs.reduce<number | null>(
          (latest, capture) => (latest === null || capture.createdAt > latest ? capture.createdAt : latest),
          null,
        ),
      };
    })
    .sort(
      (a, b) => b.needsFromMe.length - a.needsFromMe.length || a.person.name.localeCompare(b.person.name),
    );
}

/**
 * A topic is carried over when it was already on the agenda at an earlier 1:1 and is still
 * open. Notes saved today do not count, so topics raised at today's 1:1 are not flagged the
 * moment its note is saved.
 */
export function isCarriedOver(topic: Capture, card: PmCard, now: number): boolean {
  const today = dayStart(now);
  const earlier = card.oneOnOnes.find((note) => note.createdAt < today);
  return earlier !== undefined && topic.createdAt < earlier.createdAt;
}
