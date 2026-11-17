import type { CalendarEventRecord } from "./calendar";
import { findSensitive } from "./claude";
import { commitmentBoard } from "./commitments";
import { narrativeBank, STORY_LABELS, storyType, type StakeholderProfile } from "./influence";
import { ROADMAP_LABELS, type Priority, type RoadmapStatus } from "./leadership";
import { KIND_LABELS, type Capture, type Person, type Project } from "./models";
import { epicHealth, HEALTH_LABELS, type WorkItem } from "./work";

/**
 * What agents may read: a snapshot of the app's data as plain Markdown files, written to a
 * folder Claude Code is allowed to read during a run. The files are rewritten before each run
 * and never read back by the app, so an agent cannot change anything through them.
 */

export interface SnapshotData {
  captures: Capture[];
  people: Person[];
  projects: Project[];
  work: WorkItem[];
  roadmap: RoadmapStatus[];
  priorities: Priority[];
  profiles: StakeholderProfile[];
  meetings: CalendarEventRecord[];
  now: number;
}

export interface SnapshotFile {
  name: string;
  text: string;
}

const day = (time: number) => new Date(time).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });

/** Masks anything that looks like a patient or customer identifier, line by line. */
export function redact(text: string): { text: string; removed: number } {
  let removed = 0;
  const lines = text.split("\n").map((line) => {
    const found = findSensitive(line);
    if (found.length === 0) return line;
    removed += found.length;
    return `[Line withheld: it looked like it held ${found.map((entry) => entry.label.toLowerCase()).join(", ")}.]`;
  });
  return { text: lines.join("\n"), removed };
}

export function buildSnapshot(data: SnapshotData): SnapshotFile[] {
  const name = (id: number | null) => data.people.find((person) => person.id === id)?.name;
  const project = (id: number | null) => data.projects.find((entry) => entry.id === id)?.name;
  const files: SnapshotFile[] = [];

  const board = commitmentBoard(data.captures, data.now);
  const promise = (entry: (typeof board.mine)[number]) =>
    `- ${entry.capture.body} (${[KIND_LABELS[entry.capture.kind], name(entry.capture.personId), entry.capture.dueAt ? `due ${day(entry.capture.dueAt)}` : "no date", entry.slippedDays > 0 ? `slipped ${entry.slippedDays} days` : null].filter(Boolean).join(", ")})`;
  files.push({
    name: "commitments.md",
    text: [
      "# Open commitments",
      "",
      "## What David owes (his promises and asks of him)",
      board.mine.length ? board.mine.map(promise).join("\n") : "- Nothing open",
      "",
      "## What others owe David",
      board.theirs.length ? board.theirs.map(promise).join("\n") : "- Nothing open",
    ].join("\n"),
  });

  const recent = data.captures.filter((capture) => capture.createdAt >= data.now - 90 * 86_400_000).sort((a, b) => b.createdAt - a.createdAt);
  files.push({
    name: "captures.md",
    text: [
      "# Captures from the last 90 days, newest first",
      "",
      ...recent.map(
        (capture) =>
          `- ${day(capture.createdAt)} · ${KIND_LABELS[capture.kind]}${capture.isWin ? " · win" : ""}${capture.doneAt ? " · done" : ""}` +
          `${name(capture.personId) ? ` · ${name(capture.personId)}` : ""}${project(capture.projectId) ? ` · ${project(capture.projectId)}` : ""}: ${capture.body.replace(/\n+/g, " ")}`,
      ),
    ].join("\n"),
  });

  if (data.work.length > 0) {
    const open = data.work.filter((item) => item.level === "item" && item.status !== "done");
    files.push({
      name: "tickets.md",
      text: [
        "# Epics and open tickets",
        "",
        "## Epics",
        ...epicHealth(data.work, data.now).map(
          (entry) =>
            `- ${entry.epic.externalId} ${entry.epic.title}: ${HEALTH_LABELS[entry.health]}, ${entry.done} of ${entry.total} done` +
            `${entry.epic.ownerName ? `, owner ${entry.epic.ownerName}` : ""}${entry.epic.dueAt ? `, due ${day(entry.epic.dueAt)}` : ""}`,
        ),
        "",
        "## Open tickets",
        ...open.map(
          (item) =>
            `- ${item.externalId} ${item.title} (${[item.statusLabel || item.status, item.ownerName, item.team, item.parentExternalId ? `epic ${item.parentExternalId}` : null, item.waitingOnProduct ? "waiting on product" : null].filter(Boolean).join(", ")})`,
        ),
      ].join("\n"),
    });
  }

  if (data.roadmap.length + data.priorities.length > 0) {
    files.push({
      name: "roadmap.md",
      text: [
        "# The CPO's priorities and the roadmap given to leadership",
        "",
        "## Priorities, in order",
        ...data.priorities.map((priority, index) => `${index + 1}. ${priority.title}${priority.notes ? `: ${priority.notes}` : ""}`),
        "",
        "## Roadmap",
        ...data.roadmap.map(
          (status) =>
            `- ${status.item.title}: ${ROADMAP_LABELS[status.state]}${status.item.committedAt ? `, promised for ${day(status.item.committedAt)}` : ""}` +
            `${status.reasons.length ? `. ${status.reasons.join(" ")}` : ""}`,
        ),
      ].join("\n"),
    });
  }

  files.push({
    name: "people.md",
    text: [
      "# People",
      "",
      ...data.people.map((person) => {
        const profile = data.profiles.find((entry) => entry.personId === person.id);
        return [
          `- ${person.name}${person.isPM ? " (one of David's PMs)" : ""}${profile?.title ? `, ${profile.title}` : ""}${person.aliases.length ? `; also known as ${person.aliases.join(", ")}` : ""}`,
          profile?.goals ? `  - Trying to achieve: ${profile.goals}` : "",
          profile?.concerns ? `  - Worried about: ${profile.concerns}` : "",
        ]
          .filter(Boolean)
          .join("\n");
      }),
    ].join("\n"),
  });

  const bank = narrativeBank(data.captures, { days: 365 }, data.now);
  if (bank.length > 0) {
    files.push({
      name: "wins-and-evidence.md",
      text: ["# Wins, customer evidence and metrics (last 12 months)", "", ...bank.map((entry) => `- ${day(entry.createdAt)} · ${STORY_LABELS[storyType(entry)!]}: ${entry.body}`)].join("\n"),
    });
  }

  const upcoming = data.meetings.filter((meeting) => meeting.endsAt >= data.now).slice(0, 60);
  if (upcoming.length > 0) {
    files.push({
      name: "calendar.md",
      text: [
        "# David's meetings, next two weeks",
        "",
        ...upcoming.map(
          (meeting) =>
            `- ${new Date(meeting.startsAt).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}: ${meeting.title}`,
        ),
      ].join("\n"),
    });
  }

  let withheld = 0;
  const safe = files.map((file) => {
    const { text, removed } = redact(file.text);
    withheld += removed;
    return { name: file.name, text: `${text}\n` };
  });
  const readme: SnapshotFile = {
    name: "README.md",
    text: [
      "# David's Daily Work app: read-only data",
      "",
      `Written ${new Date(data.now).toLocaleString("en-US")}. This is a copy for reading; changing it changes nothing in the app.`,
      withheld > 0 ? `${withheld} line${withheld === 1 ? " was" : "s were"} withheld because they looked like patient or customer details.` : "",
      "",
      ...safe.map((file) => `- ${file.name}: ${file.text.split("\n")[0].replace(/^# /, "")}`),
      "",
    ]
      .filter((line, index, all) => line !== "" || all[index - 1] !== "")
      .join("\n"),
  };
  return [readme, ...safe];
}

/** What is added to an agent's instructions when it may read the snapshot. */
export function snapshotNote(folder: string): string {
  return `David's Daily Work app keeps his commitments, captures, tickets, roadmap, people and wins. A read-only copy is in ${folder}. Start with README.md there, and read the files when the job needs them. Do not quote patient or customer details.`;
}
