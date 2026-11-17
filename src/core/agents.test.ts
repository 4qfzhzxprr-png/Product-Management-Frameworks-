import { describe, expect, it } from "vitest";
import { openMemoryDb } from "../platform/sqljsDb";
import {
  agentRecord,
  claudeArgs,
  composePrompt,
  findLead,
  isDue,
  isProblem,
  lastOccurrence,
  nextOccurrence,
  parseAgentFile,
  parseStreamLine,
  readTeam,
  toolPolicy,
  type AgentDefinition,
  type AgentRun,
  type AgentSchedule,
} from "./agents";
import type { Capture } from "./models";
import { CaptureStore } from "./store";

const LEAD = `---
name: product-lead
description: Leads the product agent team. Breaks a request into tasks and hands them to the specialists.
tools: Task, Read, Grep
model: opus
---

You coordinate eight specialists.`;

const WRITER = `---
name: spec-writer
description: >
  Drafts PRDs and specs
  from a brief.
tools:
  - Read
  - Write
  - Bash
model: inherit
---
Write clear specs.`;

const agent = (file: string, fileName: string) => parseAgentFile({ fileName, text: file }) as AgentDefinition;

describe("agent files", () => {
  it("reads name, description, tools, model and instructions", () => {
    expect(agent(LEAD, "product-lead.md")).toEqual({
      id: "product-lead",
      fileName: "product-lead.md",
      name: "product-lead",
      description: "Leads the product agent team. Breaks a request into tasks and hands them to the specialists.",
      tools: ["Task", "Read", "Grep"],
      model: "opus",
      prompt: "You coordinate eight specialists.",
    });
  });

  it("reads folded descriptions and tool lists, and treats inherit as no model", () => {
    const writer = agent(WRITER, "spec-writer.md");
    expect(writer.description).toBe("Drafts PRDs and specs from a brief.");
    expect(writer.tools).toEqual(["Read", "Write", "Bash"]);
    expect(writer.model).toBeNull();
  });

  it("reads quoted values and gives all tools when none are listed", () => {
    const parsed = agent(`---\nname: "researcher"\ndescription: 'Market: competitors, pricing'\n---\nBody`, "researcher.md");
    expect(parsed.description).toBe("Market: competitors, pricing");
    expect(parsed.tools).toBeNull();
  });

  it("says why a file cannot be used, and skips files that are not markdown", () => {
    const team = readTeam([
      { fileName: "notes.md", text: "Just notes" },
      { fileName: "nameless.md", text: "---\ndescription: x\n---\nbody" },
      { fileName: "spec-writer.md", text: WRITER },
      { fileName: "product-lead.md", text: LEAD },
      { fileName: ".DS_Store", text: "" },
    ]);
    expect(team.agents.map((entry) => entry.name)).toEqual(["product-lead", "spec-writer"]);
    expect(team.problems.map((entry) => entry.fileName)).toEqual(["notes.md", "nameless.md"]);
    expect(isProblem(parseAgentFile({ fileName: "a.md", text: "---\nname: a\n---\n" }))).toBe(false);
  });

  it("finds the lead from its description unless David picked one", () => {
    const team = readTeam([
      { fileName: "product-lead.md", text: LEAD },
      { fileName: "spec-writer.md", text: WRITER },
    ]).agents;
    expect(findLead(team, null)?.id).toBe("product-lead");
    expect(findLead(team, "spec-writer")?.id).toBe("spec-writer");
    expect(findLead(team, "gone")?.id).toBe("product-lead");
  });
});

describe("what an agent may do", () => {
  it("allows read-only tools and blocks changing ones until switched on", () => {
    const writer = agent(WRITER, "spec-writer.md");
    expect(toolPolicy(writer, [])).toEqual({ allowed: ["Read"], blocked: ["Edit", "MultiEdit", "Write", "NotebookEdit", "Bash"] });
    expect(toolPolicy(writer, ["Write"])).toEqual({ allowed: ["Read", "Write"], blocked: ["Edit", "MultiEdit", "NotebookEdit", "Bash"] });
  });

  it("treats connector tools as changing", () => {
    const tracker = agent("---\nname: t\ntools: Read, mcp__jira__create_issue\n---\n", "t.md");
    expect(toolPolicy(tracker, []).blocked).toContain("mcp__jira__create_issue");
  });

  it("builds Claude Code arguments with the agent's instructions, tools and model", () => {
    const args = claudeArgs(agent(LEAD, "product-lead.md"), []);
    expect(args.slice(0, 4)).toEqual(["-p", "--output-format", "stream-json", "--verbose"]);
    expect(args[args.indexOf("--append-system-prompt") + 1]).toContain("You coordinate eight specialists.");
    expect(args[args.indexOf("--allowedTools") + 1]).toBe("Task,Read,Grep");
    expect(args[args.indexOf("--disallowedTools") + 1]).toBe("Edit,MultiEdit,Write,NotebookEdit,Bash");
    expect(args[args.indexOf("--model") + 1]).toBe("opus");
  });

  it("puts the brief, attachments and a revision request in the prompt", () => {
    const prompt = composePrompt({ brief: "Draft a PRD", context: "## Tickets\n- REF-1", previous: { output: "v1", feedback: "Shorter" } });
    expect(prompt).toContain("Draft a PRD");
    expect(prompt).toContain("REF-1");
    expect(prompt).toContain("Your previous answer:\n\nv1");
    expect(prompt).toContain("Shorter");
  });
});

describe("Claude Code output", () => {
  it("turns stream lines into steps and a result", () => {
    expect(parseStreamLine(JSON.stringify({ type: "system", subtype: "init", model: "claude-opus", session_id: "s" }))).toEqual([
      { step: { kind: "started", text: "Started on claude-opus" } },
    ]);
    const assistant = {
      type: "assistant",
      message: {
        content: [
          { type: "text", text: "Looking at the  tickets." },
          { type: "tool_use", name: "Task", input: { description: "Draft the PRD", subagent_type: "spec-writer" } },
          { type: "tool_use", name: "Read", input: { file_path: "/x/prd.md" } },
        ],
      },
    };
    expect(parseStreamLine(JSON.stringify(assistant))).toEqual([
      { step: { kind: "text", text: "Looking at the tickets." } },
      { step: { kind: "tool", text: "Handed work to another agent: Draft the PRD" } },
      { step: { kind: "tool", text: "Read files: /x/prd.md" } },
    ]);
    expect(
      parseStreamLine(JSON.stringify({ type: "result", subtype: "success", result: "The PRD", total_cost_usd: 0.42, duration_ms: 9000, session_id: "s" })),
    ).toEqual([{ result: { output: "The PRD", isError: false, costUsd: 0.42, durationMs: 9000, sessionId: "s" } }]);
    expect(parseStreamLine(JSON.stringify({ type: "result", subtype: "error_max_turns" }))[0]).toMatchObject({ result: { isError: true } });
    expect(parseStreamLine("not json")).toEqual([]);
  });
});

describe("schedules", () => {
  const local = (day: number, hour: number, minute = 0) => new Date(2026, 10, day, hour, minute).getTime();
  const schedule = (overrides: Partial<AgentSchedule>): AgentSchedule => ({
    id: 1,
    agentId: "a",
    brief: "Weekly status",
    cadence: { every: "week", weekday: 1, time: "08:00" },
    enabled: true,
    lastRunAt: null,
    createdAt: local(10, 9),
    ...overrides,
  });

  it("finds the last and next run times", () => {
    // Monday 16 November 2026, 09:00.
    const now = local(16, 9);
    expect(lastOccurrence({ every: "week", weekday: 1, time: "08:00" }, now)).toBe(local(16, 8));
    expect(nextOccurrence({ every: "week", weekday: 1, time: "08:00" }, now)).toBe(local(23, 8));
    expect(lastOccurrence({ every: "weekday", weekday: 0, time: "10:00" }, local(16, 9))).toBe(local(13, 10));
    expect(nextOccurrence({ every: "day", weekday: 0, time: "10:00" }, local(16, 9))).toBe(local(16, 10));
  });

  it("is due once after a missed run, not once per missed day", () => {
    const daily = schedule({ cadence: { every: "day", weekday: 0, time: "08:00" }, lastRunAt: local(12, 8) });
    expect(isDue(daily, local(16, 9))).toBe(true);
    expect(isDue({ ...daily, lastRunAt: local(16, 9) }, local(16, 10))).toBe(false);
    expect(isDue({ ...daily, enabled: false }, local(16, 9))).toBe(false);
  });

  it("does not run a new schedule for a time before it was set up", () => {
    expect(isDue(schedule({ createdAt: local(16, 8, 30) }), local(16, 9))).toBe(false);
    expect(isDue(schedule({ createdAt: local(16, 7) }), local(16, 9))).toBe(true);
  });
});

describe("review record", () => {
  const run = (id: number, overrides: Partial<AgentRun>): AgentRun => ({
    id,
    agentId: "writer",
    agentName: "writer",
    title: "",
    brief: "",
    attached: [],
    parentId: null,
    scheduleId: null,
    status: "done",
    review: "pending",
    feedback: "",
    startedAt: id,
    finishedAt: id,
    output: "",
    error: "",
    costUsd: null,
    durationMs: null,
    steps: [],
    ...overrides,
  });

  it("counts jobs approved first time, after revisions, rejected and waiting", () => {
    const runs = [
      run(1, { review: "approved" }),
      run(2, { review: "sent_back" }),
      run(3, { parentId: 2, review: "approved" }),
      run(4, { review: "rejected" }),
      run(5, {}),
      run(6, { status: "failed", review: null }),
      run(7, { agentId: "other", review: "approved" }),
    ];
    expect(agentRecord(runs, "writer")).toEqual({
      runs: 6,
      waiting: 1,
      approved: 2,
      approvedFirstTime: 1,
      decided: 3,
      rejected: 1,
      failed: 1,
      lastRunAt: 6,
    });
  });
});

describe("AgentStore", () => {
  it("records a run through review, and marks runs cut off by a restart", async () => {
    const store = await CaptureStore.open(await openMemoryDb());
    const id = await store.agents.startRun({ agentId: "writer", agentName: "spec-writer", brief: "Draft the refill PRD\nMore detail", attached: ["Open tickets"], at: 100 });
    await store.agents.finishRun(id, { status: "done", output: "PRD", costUsd: 0.1, durationMs: 2000, steps: [{ kind: "tool", text: "Read files" }], at: 200 });
    await store.agents.setReview(id, "sent_back", "Add metrics");
    const second = await store.agents.startRun({ agentId: "writer", agentName: "spec-writer", brief: "Draft the refill PRD", parentId: id, at: 300 });
    const [latest, first] = await store.agents.runs();
    expect(first).toMatchObject({ title: "Draft the refill PRD", attached: ["Open tickets"], status: "done", review: "sent_back", feedback: "Add metrics", output: "PRD", costUsd: 0.1 });
    expect(first.steps).toEqual([{ kind: "tool", text: "Read files" }]);
    expect(latest).toMatchObject({ id: second, parentId: id, status: "running", review: null });

    await store.agents.markInterrupted(400);
    expect((await store.agents.runs())[0]).toMatchObject({ status: "failed", error: "The app closed before this run finished." });
    // A run already marked finished is not overwritten by a late result.
    await store.agents.finishRun(second, { status: "done", output: "late" });
    expect((await store.agents.runs())[0].status).toBe("failed");
  });

  it("keeps schedules and their last run", async () => {
    const store = await CaptureStore.open(await openMemoryDb());
    const id = await store.agents.addSchedule({ agentId: "lead", brief: " Monday status ", cadence: { every: "week", weekday: 1, time: "08:00" }, at: 5 });
    await store.agents.markScheduleRun(id, 50);
    await store.agents.setScheduleEnabled(id, false);
    expect(await store.agents.schedules()).toEqual([
      { id, agentId: "lead", brief: "Monday status", cadence: { every: "week", weekday: 1, time: "08:00" }, enabled: false, lastRunAt: 50, createdAt: 5 },
    ]);
    await store.agents.deleteSchedule(id);
    expect(await store.agents.schedules()).toEqual([]);
  });
});

describe("context from the app", () => {
  it("attaches only the parts that have something in them, labelled", async () => {
    const { buildAgentContext } = await import("./agentContext");
    const now = new Date(2026, 10, 17, 9).getTime();
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
    const captures = [
      capture(1, "Send pilot numbers to Morgan", "commitment", { personId: 7 }),
      capture(2, "Portal beta cut support tickets by a third", "note", { isWin: true }),
    ];
    const people = [{ id: 7, name: "Morgan", isPM: false, aliases: [] }];
    const result = buildAgentContext(["work", "commitments", "bank", "stakeholder"], { work: [], captures, people, stakeholder: null, now });
    expect(result.labels).toEqual(["My open commitments and asks", "Wins, evidence and metrics (90 days)"]);
    expect(result.text).toContain("- My commitment: Send pilot numbers to Morgan (Morgan)");
    expect(result.text).toContain("Portal beta cut support tickets by a third");
    expect(result.text).not.toContain("Epics in progress");
    expect(buildAgentContext([], { work: [], captures, people, stakeholder: null, now })).toEqual({ text: "", labels: [] });
  });
});

describe("search", () => {
  it("finds people by other names, captures by words, and ranks pages and good matches first", async () => {
    const { search } = await import("./search");
    const now = new Date(2026, 10, 17).getTime();
    const capture = (id: number, body: string, extra: Partial<Capture> = {}): Capture => ({
      id, createdAt: now - id * 86_400_000, kind: "note", body, personId: null, projectId: null, isWin: false, doneAt: null, dueAt: null, ...extra,
    });
    const data = {
      pages: [{ view: "delivery", label: "Delivery" }, { view: "agents", label: "Agents" }],
      captures: [capture(1, "Refill pilot readout for Jordan", { personId: 1 }), capture(2, "Pricing experiment results")],
      people: [{ id: 1, name: "Priya", isPM: true, aliases: ["Priya S."] }],
      projects: [{ id: 1, name: "Refill flow" }],
      work: [],
      runs: [],
      roadmap: [],
      priorities: [],
      now,
    };
    expect(search("", data)).toEqual([]);
    expect(search("priya s", data)[0]).toMatchObject({ group: "Person", title: "Priya" });
    expect(search("refill", data).map((result) => result.group)).toEqual(["Project", "Capture"]);
    expect(search("pilot jordan", data)[0].title).toBe("Refill pilot readout for Jordan");
    expect(search("deliv", data)[0]).toMatchObject({ group: "Page", target: { type: "page", view: "delivery" } });
  });
});

describe("the agent report", () => {
  it("counts runs, first-time approvals, sends back, failures, time and spend since a date", async () => {
    const { agentStats } = await import("./agents");
    const base = { title: "", brief: "", attached: [], scheduleId: null, feedback: "", output: "", error: "", steps: [] };
    const runs: AgentRun[] = [
      { ...base, id: 1, agentId: "w", agentName: "writer", parentId: null, status: "done", review: "approved", startedAt: 100, finishedAt: 200, costUsd: 0.5, durationMs: 60_000 },
      { ...base, id: 2, agentId: "w", agentName: "writer", parentId: null, status: "done", review: "sent_back", startedAt: 300, finishedAt: 400, costUsd: 0.25, durationMs: 120_000 },
      { ...base, id: 3, agentId: "w", agentName: "writer", parentId: 2, status: "done", review: "approved", startedAt: 500, finishedAt: 600, costUsd: 0.25, durationMs: null },
      { ...base, id: 4, agentId: "r", agentName: "researcher", parentId: null, status: "failed", review: null, startedAt: 700, finishedAt: 710, costUsd: null, durationMs: null },
      { ...base, id: 5, agentId: "r", agentName: "researcher", parentId: null, status: "done", review: "approved", startedAt: 10, finishedAt: 20, costUsd: 9, durationMs: 1 },
    ];
    const [writer, researcher] = agentStats(runs, 50);
    expect(writer).toMatchObject({ agentName: "writer", runs: 3, firstTime: 1, decided: 2, sentBack: 1, failed: 0, costUsd: 1 });
    expect(writer.averageMs).toBeCloseTo((60_000 + 120_000 + 100) / 3);
    expect(researcher).toMatchObject({ runs: 1, failed: 1, costUsd: 0, averageMs: null });
  });
});
