import { dayStart } from "./insights";
import type { Capture, Person } from "./models";

/** Everything the team board shows for one product manager, built from captures alone. */
export interface PmCard {
  person: Person;
  /** Open asks they made of David, and David's open commitments to them. Oldest first. */
  needsFromMe: Capture[];
  /** Open asks David made of them. Oldest first. */
  waitingOnThem: Capture[];
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
