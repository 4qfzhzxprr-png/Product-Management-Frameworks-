import { describe, expect, it } from "vitest";
import { claudeArgs, parseAgentFile, type AgentDefinition } from "./agents";
import type { Capture, Person } from "./models";
import { buildSnapshot, redact, snapshotNote } from "./snapshot";

const now = new Date(2026, 10, 17, 9).getTime();
const people: Person[] = [
  { id: 1, name: "Priya", isPM: true, aliases: ["Priya S."] },
  { id: 2, name: "Morgan", isPM: false, aliases: [] },
];
const capture = (id: number, body: string, kind: Capture["kind"], extra: Partial<Capture> = {}): Capture => ({
  id,
  createdAt: now - id * 86_400_000,
  kind,
  body,
  personId: null,
  projectId: null,
  isWin: false,
  doneAt: null,
  dueAt: null,
  ...extra,
});

describe("the agent snapshot", () => {
  const files = buildSnapshot({
    captures: [
      capture(1, "Send Priya the pilot numbers", "commitment", { personId: 1, dueAt: now - 2 * 86_400_000 }),
      capture(2, "Cost model for the Q1 plan", "ask_of_them", { personId: 2 }),
      capture(3, "Portal beta cut support tickets by a third", "note", { isWin: true }),
      capture(4, "Call back about MRN 00451823 refill", "note"),
    ],
    people,
    projects: [],
    work: [],
    roadmap: [],
    priorities: [],
    profiles: [{ personId: 2, title: "CFO", goals: "Margin above 30%", concerns: "Pilots that never pay", updatedAt: now }],
    meetings: [],
    now,
  });
  const text = (name: string) => files.find((file) => file.name === name)?.text ?? "";

  it("writes plain files with a README that lists them", () => {
    expect(files.map((file) => file.name)).toEqual(["README.md", "commitments.md", "captures.md", "people.md", "wins-and-evidence.md"]);
    expect(text("README.md")).toContain("- commitments.md: Open commitments");
    expect(text("commitments.md")).toContain("- Send Priya the pilot numbers (My commitment, Priya, due Sun, Nov 15, 2026, slipped 2 days)");
    expect(text("commitments.md")).toContain("## What others owe David\n- Cost model for the Q1 plan (Ask of them, Morgan, no date)");
    expect(text("people.md")).toContain("- Morgan, CFO\n  - Trying to achieve: Margin above 30%");
    expect(text("people.md")).toContain("Priya (one of David's PMs); also known as Priya S.");
  });

  it("withholds lines that look like patient or customer details, and says so", () => {
    expect(text("captures.md")).not.toContain("00451823");
    expect(text("captures.md")).toContain("[Line withheld: it looked like it held medical record or member number.]");
    expect(text("README.md")).toContain("1 line was withheld");
    expect(redact("Nothing sensitive here").removed).toBe(0);
  });
});

describe("letting an agent read it", () => {
  const reader = parseAgentFile({ fileName: "r.md", text: "---\nname: researcher\ntools: Read, WebSearch\n---\nResearch." }) as AgentDefinition;
  const writerOnly = parseAgentFile({ fileName: "w.md", text: "---\nname: notes\ntools: WebSearch\n---\nNo files." }) as AgentDefinition;
  const snapshot = { folder: "/data/agent-snapshot", note: snapshotNote("/data/agent-snapshot") };

  it("adds the folder and a note only for agents allowed to read files", () => {
    const args = claudeArgs(reader, [], snapshot);
    expect(args[args.indexOf("--add-dir") + 1]).toBe("/data/agent-snapshot");
    expect(args[args.indexOf("--append-system-prompt") + 1]).toContain("A read-only copy is in /data/agent-snapshot");
    const without = claudeArgs(writerOnly, [], snapshot);
    expect(without).not.toContain("--add-dir");
    expect(without[without.indexOf("--append-system-prompt") + 1]).not.toContain("read-only copy");
  });
});
