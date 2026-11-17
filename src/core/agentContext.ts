import { commitmentBoard } from "./commitments";
import { narrativeBank, STORY_LABELS, storyType, type Stakeholder } from "./influence";
import { KIND_LABELS, type Capture, type Person } from "./models";
import { blockers, epicHealth, HEALTH_LABELS, type WorkItem } from "./work";

/** What David can attach to a brief from what the app already holds. */
export type ContextChoice = "work" | "commitments" | "bank" | "stakeholder";

export const CONTEXT_LABELS: Record<ContextChoice, string> = {
  work: "Epics and stuck tickets",
  commitments: "My open commitments and asks",
  bank: "Wins, evidence and metrics (90 days)",
  stakeholder: "An executive's profile",
};

const day = (time: number) => new Date(time).toLocaleDateString(undefined, { month: "short", day: "numeric" });

/** Builds the text attached to a brief, with a label for each part that had something in it. */
export function buildAgentContext(
  choices: ContextChoice[],
  data: { work: WorkItem[]; captures: Capture[]; people: Person[]; stakeholder: Stakeholder | null; now: number },
): { text: string; labels: string[] } {
  const sections: string[] = [];
  const labels: string[] = [];
  const name = (id: number | null) => data.people.find((person) => person.id === id)?.name;

  if (choices.includes("work") && data.work.length > 0) {
    const epics = epicHealth(data.work, data.now)
      .filter((entry) => entry.health !== "done")
      .slice(0, 30)
      .map(
        (entry) =>
          `- ${entry.epic.externalId} ${entry.epic.title}: ${HEALTH_LABELS[entry.health]}, ${entry.done} of ${entry.total} done` +
          (entry.epic.ownerName ? `, owner ${entry.epic.ownerName}` : "") +
          (entry.epic.dueAt ? `, due ${day(entry.epic.dueAt)}` : ""),
      );
    const stuck = blockers(data.work)
      .slice(0, 30)
      .map(
        (item) =>
          `- ${item.externalId} ${item.title}: ${item.waitingOnProduct ? "waiting on product" : item.statusLabel || "blocked"}` +
          (item.team ? `, ${item.team}` : ""),
      );
    sections.push(
      ["## Epics in progress", epics.length ? epics.join("\n") : "- None", "", "## Blocked or waiting on product", stuck.length ? stuck.join("\n") : "- None"].join("\n"),
    );
    labels.push(CONTEXT_LABELS.work);
  }

  if (choices.includes("commitments")) {
    const board = commitmentBoard(data.captures, data.now);
    const line = (capture: Capture) =>
      `- ${KIND_LABELS[capture.kind]}: ${capture.body}` +
      (name(capture.personId) ? ` (${name(capture.personId)})` : "") +
      (capture.dueAt ? `, due ${day(capture.dueAt)}` : "");
    if (board.mine.length + board.theirs.length > 0) {
      sections.push(
        [
          "## What I owe",
          board.mine.length ? board.mine.map((entry) => line(entry.capture)).join("\n") : "- Nothing open",
          "",
          "## What others owe me",
          board.theirs.length ? board.theirs.map((entry) => line(entry.capture)).join("\n") : "- Nothing open",
        ].join("\n"),
      );
      labels.push(CONTEXT_LABELS.commitments);
    }
  }

  if (choices.includes("bank")) {
    const entries = narrativeBank(data.captures, { days: 90 }, data.now).slice(0, 40);
    if (entries.length > 0) {
      sections.push(
        ["## Wins, customer evidence and metrics", ...entries.map((entry) => `- ${STORY_LABELS[storyType(entry)!]}: ${entry.body} (${day(entry.createdAt)})`)].join("\n"),
      );
      labels.push(CONTEXT_LABELS.bank);
    }
  }

  if (choices.includes("stakeholder") && data.stakeholder) {
    const { person, profile } = data.stakeholder;
    sections.push(
      [
        `## About ${person.name}${profile.title ? `, ${profile.title}` : ""}`,
        `- Trying to achieve: ${profile.goals || "not noted"}`,
        `- Worried about: ${profile.concerns || "not noted"}`,
      ].join("\n"),
    );
    labels.push(`${person.name}'s profile`);
  }

  return { text: sections.join("\n\n"), labels };
}
