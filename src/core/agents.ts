import type { Db, SqlParam } from "./db";

/**
 * David's agent team: Claude Code subagents defined in `.claude/agents/*.md` files on his Mac.
 * The files are the source of truth. The app reads them, runs them through a runner, and
 * keeps a record of every run for review. It never edits the files.
 */

/** One agent file as read from disk. */
export interface AgentFile {
  fileName: string;
  text: string;
}

/** An agent, from the front matter and body of its file. */
export interface AgentDefinition {
  /** The file name without ".md"; stable while the file keeps its name. */
  id: string;
  fileName: string;
  name: string;
  description: string;
  /** The tools the file lists, or null when it lists none (Claude Code then gives it all tools). */
  tools: string[] | null;
  /** "sonnet", "opus", "haiku", a full model name, or null to use Claude Code's default. */
  model: string | null;
  /** The instructions under the front matter. */
  prompt: string;
}

export interface AgentFileProblem {
  fileName: string;
  problem: string;
}

/** Reads the small part of YAML that agent files use: `key: value`, quoted values, block text and lists. */
function frontMatter(text: string): { fields: Record<string, string | string[]>; body: string } | null {
  const match = /^﻿?---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)([\s\S]*)$/.exec(text);
  if (!match) return null;
  const fields: Record<string, string | string[]> = {};
  const lines = match[1].split(/\r?\n/);
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const pair = /^([A-Za-z][\w-]*):[ \t]*(.*)$/.exec(line);
    if (!pair) continue;
    const key = pair[1].toLowerCase();
    let value = pair[2].trim();
    const indented: string[] = [];
    while (index + 1 < lines.length && (/^\s+\S/.test(lines[index + 1]) || lines[index + 1].trim() === "")) {
      indented.push(lines[++index]);
    }
    if (value === "|" || value === ">" || /^[|>][+-]?$/.test(value)) {
      const joined = indented.map((entry) => entry.trim());
      fields[key] = (value.startsWith("|") ? joined.join("\n") : joined.filter(Boolean).join(" ")).trim();
    } else if (value === "" && indented.some((entry) => /^\s*-\s+/.test(entry))) {
      fields[key] = indented.filter((entry) => /^\s*-\s+/.test(entry)).map((entry) => unquote(entry.replace(/^\s*-\s+/, "")));
    } else {
      if (indented.length > 0 && !/^["'[]/.test(value)) value = [value, ...indented.map((entry) => entry.trim())].filter(Boolean).join(" ");
      fields[key] = unquote(value);
    }
  }
  return { fields, body: match[2].trim() };
}

function unquote(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length >= 2 && ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'")))) {
    const inner = trimmed.slice(1, -1);
    return trimmed.startsWith('"') ? inner.replace(/\\n/g, "\n").replace(/\\"/g, '"').replace(/\\\\/g, "\\") : inner.replace(/''/g, "'");
  }
  return trimmed;
}

function toolList(value: string | string[] | undefined): string[] | null {
  if (value === undefined) return null;
  const list = (Array.isArray(value) ? value : value.replace(/^\[|\]$/g, "").split(","))
    .map((tool) => unquote(tool).trim())
    .filter(Boolean);
  return list.length > 0 ? list : null;
}

/** Turns an agent file into a definition, or says why it cannot be used. */
export function parseAgentFile(file: AgentFile): AgentDefinition | AgentFileProblem {
  const parsed = frontMatter(file.text);
  if (!parsed) return { fileName: file.fileName, problem: "It has no front matter (the block between --- lines at the top)." };
  const field = (key: string) => {
    const value = parsed.fields[key];
    return Array.isArray(value) ? value.join(", ") : (value ?? "").trim();
  };
  const name = field("name");
  if (!name) return { fileName: file.fileName, problem: "Its front matter has no name." };
  const model = field("model");
  return {
    id: file.fileName.replace(/\.md$/i, ""),
    fileName: file.fileName,
    name,
    description: field("description"),
    tools: toolList(parsed.fields.tools),
    model: model && model !== "inherit" ? model : null,
    prompt: parsed.body,
  };
}

export function isProblem(entry: AgentDefinition | AgentFileProblem): entry is AgentFileProblem {
  return "problem" in entry;
}

/** Reads every file, keeping the agents and listing the files that could not be used. Sorted by name. */
export function readTeam(files: AgentFile[]): { agents: AgentDefinition[]; problems: AgentFileProblem[] } {
  const agents: AgentDefinition[] = [];
  const problems: AgentFileProblem[] = [];
  for (const file of files.filter((entry) => /\.md$/i.test(entry.fileName))) {
    const parsed = parseAgentFile(file);
    if (isProblem(parsed)) problems.push(parsed);
    else agents.push(parsed);
  }
  agents.sort((a, b) => a.name.localeCompare(b.name));
  return { agents, problems };
}

/** The lead: the one David chose, else the only agent whose name or description says it leads. */
export function findLead(agents: AgentDefinition[], chosen: string | null): AgentDefinition | null {
  if (chosen) {
    const picked = agents.find((agent) => agent.id === chosen);
    if (picked) return picked;
  }
  const leads = agents.filter((agent) =>
    /\b(lead|orchestrat\w*|coordinat\w*|manager|director|chief|head)\b/i.test(`${agent.name} ${agent.description}`),
  );
  return leads.length === 1 ? leads[0] : null;
}

// ---------- What an agent may do ----------

/** Tools that only read or look things up. Agents get these without asking. */
export const READ_ONLY_TOOLS = ["Read", "Grep", "Glob", "LS", "WebSearch", "WebFetch", "TodoWrite", "Task"];
/** Tools that change files, run commands or act elsewhere. Each needs David's say-so per agent. */
export const CHANGING_TOOLS = ["Edit", "MultiEdit", "Write", "NotebookEdit", "Bash"];

export const TOOL_LABELS: Record<string, string> = {
  Read: "Read files",
  Grep: "Search file contents",
  Glob: "Find files",
  LS: "List folders",
  WebSearch: "Search the web",
  WebFetch: "Read web pages",
  TodoWrite: "Keep a to-do list",
  Task: "Hand work to other agents",
  Edit: "Edit files",
  MultiEdit: "Edit files",
  Write: "Create files",
  NotebookEdit: "Edit notebooks",
  Bash: "Run commands",
};

/** A tool can change something unless it is on the read-only list. Connector (mcp__) tools count as changing. */
export function isChangingTool(tool: string): boolean {
  return !READ_ONLY_TOOLS.includes(tool);
}

/**
 * Which tools a run may use. Read-only tools the agent lists are allowed; a tool that can change
 * something is allowed only if David switched it on for this agent. An agent that lists no tools
 * gets the read-only set. Everything that can change something and is not allowed is blocked.
 */
export function toolPolicy(agent: AgentDefinition, switchedOn: string[]): { allowed: string[]; blocked: string[] } {
  const listed = agent.tools ?? READ_ONLY_TOOLS;
  const allowed = listed.filter((tool) => !isChangingTool(tool) || switchedOn.includes(tool));
  const blocked = [...new Set([...CHANGING_TOOLS, ...listed.filter(isChangingTool)])].filter((tool) => !allowed.includes(tool));
  return { allowed, blocked };
}

/** The tools in an agent's file that need David's say-so. */
export function changingToolsOf(agent: AgentDefinition): string[] {
  return (agent.tools ?? []).filter(isChangingTool);
}

// ---------- Running ----------

/**
 * The command-line arguments for one run of Claude Code in its non-interactive mode. The brief
 * goes in on standard input. With a snapshot folder, an agent that may read files is also let
 * into that folder and told what is there.
 */
export function claudeArgs(agent: AgentDefinition, switchedOn: string[], snapshot?: { folder: string; note: string }): string[] {
  const { allowed, blocked } = toolPolicy(agent, switchedOn);
  const reads = snapshot && allowed.includes("Read");
  const args = [
    "-p",
    "--output-format",
    "stream-json",
    "--verbose",
    "--append-system-prompt",
    [`You are acting as "${agent.name}", one of David's product agents.`, agent.prompt, reads ? snapshot.note : ""].filter(Boolean).join("\n\n").trim(),
  ];
  if (reads) args.push("--add-dir", snapshot.folder);
  if (allowed.length > 0) args.push("--allowedTools", allowed.join(","));
  if (blocked.length > 0) args.push("--disallowedTools", blocked.join(","));
  if (agent.model) args.push("--model", agent.model);
  return args;
}

/** What goes to the agent: the brief, anything attached from the app, and on a follow-up, the last answer and David's feedback. */
export function composePrompt(input: {
  brief: string;
  context?: string;
  previous?: { output: string; feedback: string };
}): string {
  const parts = [input.brief.trim()];
  if (input.context?.trim()) parts.push(`Context from David's Daily Work app:\n\n${input.context.trim()}`);
  if (input.previous) {
    parts.push(`Your previous answer:\n\n${input.previous.output.trim()}`);
    parts.push(`David's feedback on it:\n\n${input.previous.feedback.trim()}\n\nRevise your answer to address the feedback. Reply with the full revised answer.`);
  }
  parts.push("Reply with the finished piece of work only. It goes to David for review before anyone else sees it.");
  return parts.join("\n\n---\n\n");
}

/** One step shown while a run is in progress. */
export interface RunStep {
  kind: "started" | "tool" | "text";
  text: string;
}

export interface RunResult {
  output: string;
  isError: boolean;
  costUsd: number | null;
  durationMs: number | null;
  sessionId: string | null;
}

export type StreamEvent = { step: RunStep } | { result: RunResult } | null;

function toolDetail(input: Record<string, unknown> | undefined): string {
  if (!input) return "";
  for (const key of ["description", "subagent_type", "file_path", "path", "pattern", "query", "url", "command"]) {
    const value = input[key];
    if (typeof value === "string" && value.trim()) return value.trim().slice(0, 120);
  }
  return "";
}

/** Reads one line of Claude Code's stream-json output. Lines it does not recognize are skipped. */
export function parseStreamLine(line: string): StreamEvent[] {
  let message: Record<string, unknown>;
  try {
    message = JSON.parse(line) as Record<string, unknown>;
  } catch {
    return [];
  }
  if (message.type === "system" && message.subtype === "init") {
    const model = typeof message.model === "string" ? ` on ${message.model}` : "";
    return [{ step: { kind: "started", text: `Started${model}` } }];
  }
  if (message.type === "assistant") {
    const content = (message.message as { content?: unknown[] } | undefined)?.content ?? [];
    return content.flatMap((part): StreamEvent[] => {
      const entry = part as { type?: string; text?: string; name?: string; input?: Record<string, unknown> };
      if (entry.type === "tool_use" && entry.name) {
        const label = entry.name === "Task" ? "Handed work to another agent" : (TOOL_LABELS[entry.name] ?? entry.name);
        const detail = toolDetail(entry.input);
        return [{ step: { kind: "tool", text: detail ? `${label}: ${detail}` : label } }];
      }
      if (entry.type === "text" && entry.text?.trim()) {
        return [{ step: { kind: "text", text: entry.text.trim().replace(/\s+/g, " ").slice(0, 160) } }];
      }
      return [];
    });
  }
  if (message.type === "result") {
    const number = (value: unknown) => (typeof value === "number" ? value : null);
    return [
      {
        result: {
          output: typeof message.result === "string" ? message.result : "",
          isError: message.is_error === true || (typeof message.subtype === "string" && message.subtype !== "success"),
          costUsd: number(message.total_cost_usd),
          durationMs: number(message.duration_ms),
          sessionId: typeof message.session_id === "string" ? message.session_id : null,
        },
      },
    ];
  }
  return [];
}

/** Starts and stops runs. The Mac app starts Claude Code; the browser preview pretends. */
export interface AgentRunner {
  /** Whether runs can start, and if not, why. */
  check(configuredPath: string): Promise<{ ok: true; program: string } | { ok: false; reason: string }>;
  /** Reads the agent files in a folder. "~" means the home folder. */
  readFolder(folder: string): Promise<AgentFile[]>;
  /** Runs to the end, passing each line of output as it arrives. */
  start(
    request: { runId: number; program: string; args: string[]; prompt: string; cwd: string },
    onLine: (line: string) => void,
  ): Promise<{ code: number | null; stderr: string }>;
  cancel(runId: number): Promise<void>;
}

// ---------- Stored runs ----------

export type RunStatus = "running" | "done" | "failed" | "cancelled";
export type Review = "pending" | "approved" | "sent_back" | "rejected";

export interface AgentRun {
  id: number;
  agentId: string;
  agentName: string;
  /** A short name for the job, for lists. */
  title: string;
  brief: string;
  /** The labels of what was attached from the app, for showing; the text itself is in the prompt. */
  attached: string[];
  /** The run this one revises, when David sent work back. */
  parentId: number | null;
  scheduleId: number | null;
  status: RunStatus;
  /** Null until the run finishes well; then pending until David decides. */
  review: Review | null;
  feedback: string;
  startedAt: number;
  finishedAt: number | null;
  output: string;
  error: string;
  costUsd: number | null;
  durationMs: number | null;
  /** The last steps, kept for the record. */
  steps: RunStep[];
}

interface RunRow {
  id: number;
  agent_id: string;
  agent_name: string;
  title: string;
  brief: string;
  attached: string;
  parent_id: number | null;
  schedule_id: number | null;
  status: string;
  review: string | null;
  feedback: string;
  started_at: number;
  finished_at: number | null;
  output: string;
  error: string;
  cost_usd: number | null;
  duration_ms: number | null;
  steps: string;
}

function parseJson<T>(text: string, fallback: T): T {
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}

function toRun(row: RunRow): AgentRun {
  return {
    id: row.id,
    agentId: row.agent_id,
    agentName: row.agent_name,
    title: row.title,
    brief: row.brief,
    attached: parseJson<string[]>(row.attached, []),
    parentId: row.parent_id,
    scheduleId: row.schedule_id,
    status: row.status as RunStatus,
    review: (row.review as Review | null) ?? null,
    feedback: row.feedback,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    output: row.output,
    error: row.error,
    costUsd: row.cost_usd,
    durationMs: row.duration_ms,
    steps: parseJson<RunStep[]>(row.steps, []),
  };
}

/** A short title from the first line of a brief. */
export function titleFrom(brief: string): string {
  const first = brief.trim().split(/\r?\n/)[0]?.trim() ?? "";
  return first.length > 80 ? `${first.slice(0, 79).trimEnd()}…` : first || "Untitled job";
}

// ---------- Schedules ----------

export interface Cadence {
  every: "day" | "weekday" | "week";
  /** 0 Sunday to 6 Saturday, for weekly jobs. */
  weekday: number;
  /** "HH:MM", local time. */
  time: string;
}

export interface AgentSchedule {
  id: number;
  agentId: string;
  brief: string;
  cadence: Cadence;
  enabled: boolean;
  /** When it last started a run, or null if never. */
  lastRunAt: number | null;
  createdAt: number;
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function describeCadence(cadence: Cadence): string {
  const [hours, minutes] = cadence.time.split(":").map(Number);
  const at = new Date(2000, 0, 1, hours, minutes).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (cadence.every === "day") return `Every day at ${at}`;
  if (cadence.every === "weekday") return `Weekdays at ${at}`;
  return `${WEEKDAYS[cadence.weekday]}s at ${at}`;
}

function matchesDay(cadence: Cadence, day: Date): boolean {
  if (cadence.every === "day") return true;
  if (cadence.every === "weekday") return day.getDay() >= 1 && day.getDay() <= 5;
  return day.getDay() === cadence.weekday;
}

function at(day: Date, time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), hours || 0, minutes || 0).getTime();
}

/** The most recent time the job should have run, at or before now, in local time. */
export function lastOccurrence(cadence: Cadence, now: number): number | null {
  const today = new Date(now);
  for (let back = 0; back <= 7; back++) {
    const day = new Date(today.getFullYear(), today.getMonth(), today.getDate() - back);
    if (!matchesDay(cadence, day)) continue;
    const time = at(day, cadence.time);
    if (time <= now) return time;
  }
  return null;
}

/** The next time the job will run, after now. */
export function nextOccurrence(cadence: Cadence, now: number): number {
  const today = new Date(now);
  for (let ahead = 0; ahead <= 8; ahead++) {
    const day = new Date(today.getFullYear(), today.getMonth(), today.getDate() + ahead);
    if (!matchesDay(cadence, day)) continue;
    const time = at(day, cadence.time);
    if (time > now) return time;
  }
  return now;
}

/**
 * A job is due when a run time has passed since it last ran (or since it was set up).
 * Missed runs while the app was closed are made up once, not once per missed day.
 */
export function isDue(schedule: AgentSchedule, now: number): boolean {
  if (!schedule.enabled) return false;
  const last = lastOccurrence(schedule.cadence, now);
  return last !== null && last > (schedule.lastRunAt ?? schedule.createdAt);
}

interface ScheduleRow {
  id: number;
  agent_id: string;
  brief: string;
  cadence: string;
  enabled: number;
  last_run_at: number | null;
  created_at: number;
}

// ---------- Review record ----------

export interface AgentRecord {
  runs: number;
  waiting: number;
  approved: number;
  /** Jobs approved without being sent back first. */
  approvedFirstTime: number;
  /** Jobs that ended (approved or rejected); the base for the first-time rate. */
  decided: number;
  rejected: number;
  failed: number;
  lastRunAt: number | null;
}

/** How each agent's work has gone: a job is the first run and every revision David asked for. */
export function agentRecord(runs: AgentRun[], agentId: string): AgentRecord {
  const mine = runs.filter((run) => run.agentId === agentId);
  const byId = new Map(runs.map((run) => [run.id, run]));
  const rootOf = (run: AgentRun): AgentRun => {
    let current = run;
    const seen = new Set<number>();
    while (current.parentId !== null && byId.has(current.parentId) && !seen.has(current.id)) {
      seen.add(current.id);
      current = byId.get(current.parentId)!;
    }
    return current;
  };
  const jobs = new Map<number, AgentRun[]>();
  for (const run of mine) {
    const root = rootOf(run).id;
    jobs.set(root, [...(jobs.get(root) ?? []), run]);
  }
  let approved = 0;
  let approvedFirstTime = 0;
  let rejected = 0;
  for (const chain of jobs.values()) {
    if (chain.some((run) => run.review === "approved")) {
      approved++;
      if (chain.length === 1) approvedFirstTime++;
    } else if (chain.some((run) => run.review === "rejected")) rejected++;
  }
  return {
    runs: mine.length,
    waiting: mine.filter((run) => run.review === "pending").length,
    approved,
    approvedFirstTime,
    decided: approved + rejected,
    rejected,
    failed: mine.filter((run) => run.status === "failed").length,
    lastRunAt: mine.reduce<number | null>((latest, run) => (latest === null || run.startedAt > latest ? run.startedAt : latest), null),
  };
}

// ---------- Settings ----------

export const AGENT_SETTINGS = "agents";

export interface AgentSettings {
  /** Where the agent files are. */
  folder: string;
  /** Where Claude Code is, if it is not found on its own. Empty means look for it. */
  claudePath: string;
  /** The folder runs start in, which is what read and search tools see. */
  workFolder: string;
  /** The agent David marked as lead, overriding the guess from names. */
  leadId: string | null;
  /** Tools that can change things, switched on per agent. */
  switchedOn: Record<string, string[]>;
  /** Whether agents that can read files may read a copy of the app's data. */
  shareAppData: boolean;
}

export function completeAgentSettings(saved: Partial<AgentSettings> | null): AgentSettings {
  return {
    folder: saved?.folder || "~/.claude/agents",
    claudePath: saved?.claudePath ?? "",
    workFolder: saved?.workFolder || "~",
    leadId: saved?.leadId ?? null,
    switchedOn: saved?.switchedOn ?? {},
    shareAppData: saved?.shareAppData ?? true,
  };
}

// ---------- Storage ----------

/** Runs and schedules. Tables are created by CaptureStore.open. */
export class AgentStore {
  constructor(private readonly db: Db) {}

  async runs(limit = 500): Promise<AgentRun[]> {
    const rows = await this.db.all<RunRow>("SELECT * FROM agent_runs ORDER BY started_at DESC, id DESC LIMIT ?", [limit]);
    return rows.map(toRun);
  }

  async startRun(input: {
    agentId: string;
    agentName: string;
    brief: string;
    attached?: string[];
    parentId?: number | null;
    scheduleId?: number | null;
    at?: number;
  }): Promise<number> {
    const { lastInsertId } = await this.db.run(
      `INSERT INTO agent_runs (agent_id, agent_name, title, brief, attached, parent_id, schedule_id, status, feedback, started_at, output, error, steps)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'running', '', ?, '', '', '[]')`,
      [
        input.agentId,
        input.agentName,
        titleFrom(input.brief),
        input.brief,
        JSON.stringify(input.attached ?? []),
        input.parentId ?? null,
        input.scheduleId ?? null,
        input.at ?? Date.now(),
      ],
    );
    return lastInsertId;
  }

  async finishRun(
    id: number,
    outcome: { status: Exclude<RunStatus, "running">; output?: string; error?: string; costUsd?: number | null; durationMs?: number | null; steps?: RunStep[]; at?: number },
  ): Promise<void> {
    const params: SqlParam[] = [
      outcome.status,
      outcome.status === "done" ? "pending" : null,
      outcome.at ?? Date.now(),
      outcome.output ?? "",
      outcome.error ?? "",
      outcome.costUsd ?? null,
      outcome.durationMs ?? null,
      JSON.stringify((outcome.steps ?? []).slice(-40)),
      id,
    ];
    await this.db.run(
      `UPDATE agent_runs SET status = ?, review = ?, finished_at = ?, output = ?, error = ?, cost_usd = ?, duration_ms = ?, steps = ?
       WHERE id = ? AND status = 'running'`,
      params,
    );
  }

  async setReview(id: number, review: Review, feedback = ""): Promise<void> {
    await this.db.run("UPDATE agent_runs SET review = ?, feedback = ? WHERE id = ?", [review, feedback, id]);
  }

  async deleteRun(id: number): Promise<void> {
    await this.db.run("UPDATE agent_runs SET parent_id = NULL WHERE parent_id = ?", [id]);
    await this.db.run("DELETE FROM agent_runs WHERE id = ?", [id]);
  }

  /** Runs left "running" when the app last closed did not finish; says so. */
  async markInterrupted(at = Date.now()): Promise<void> {
    await this.db.run(
      "UPDATE agent_runs SET status = 'failed', finished_at = ?, error = ? WHERE status = 'running'",
      [at, "The app closed before this run finished."],
    );
  }

  async schedules(): Promise<AgentSchedule[]> {
    const rows = await this.db.all<ScheduleRow>("SELECT * FROM agent_schedules ORDER BY created_at");
    return rows.map((row) => ({
      id: row.id,
      agentId: row.agent_id,
      brief: row.brief,
      cadence: parseJson<Cadence>(row.cadence, { every: "week", weekday: 1, time: "08:00" }),
      enabled: row.enabled === 1,
      lastRunAt: row.last_run_at,
      createdAt: row.created_at,
    }));
  }

  async addSchedule(input: { agentId: string; brief: string; cadence: Cadence; at?: number }): Promise<number> {
    const { lastInsertId } = await this.db.run(
      "INSERT INTO agent_schedules (agent_id, brief, cadence, enabled, created_at) VALUES (?, ?, ?, 1, ?)",
      [input.agentId, input.brief.trim(), JSON.stringify(input.cadence), input.at ?? Date.now()],
    );
    return lastInsertId;
  }

  async setScheduleEnabled(id: number, enabled: boolean): Promise<void> {
    await this.db.run("UPDATE agent_schedules SET enabled = ? WHERE id = ?", [enabled ? 1 : 0, id]);
  }

  async markScheduleRun(id: number, at = Date.now()): Promise<void> {
    await this.db.run("UPDATE agent_schedules SET last_run_at = ? WHERE id = ?", [at, id]);
  }

  async deleteSchedule(id: number): Promise<void> {
    await this.db.run("UPDATE agent_runs SET schedule_id = NULL WHERE schedule_id = ?", [id]);
    await this.db.run("DELETE FROM agent_schedules WHERE id = ?", [id]);
  }
}

/** Created by CaptureStore.open; every statement is safe to run twice. */
export const AGENT_TABLES = [
  `CREATE TABLE IF NOT EXISTS agent_runs (
     id INTEGER PRIMARY KEY,
     agent_id TEXT NOT NULL,
     agent_name TEXT NOT NULL,
     title TEXT NOT NULL,
     brief TEXT NOT NULL,
     attached TEXT NOT NULL DEFAULT '[]',
     parent_id INTEGER,
     schedule_id INTEGER,
     status TEXT NOT NULL,
     review TEXT,
     feedback TEXT NOT NULL DEFAULT '',
     started_at INTEGER NOT NULL,
     finished_at INTEGER,
     output TEXT NOT NULL DEFAULT '',
     error TEXT NOT NULL DEFAULT '',
     cost_usd REAL,
     duration_ms INTEGER,
     steps TEXT NOT NULL DEFAULT '[]'
   )`,
  `CREATE INDEX IF NOT EXISTS agent_runs_started ON agent_runs(started_at DESC)`,
  `CREATE TABLE IF NOT EXISTS agent_schedules (
     id INTEGER PRIMARY KEY,
     agent_id TEXT NOT NULL,
     brief TEXT NOT NULL,
     cadence TEXT NOT NULL,
     enabled INTEGER NOT NULL DEFAULT 1,
     last_run_at INTEGER,
     created_at INTEGER NOT NULL
   )`,
];

// ---------- The report ----------

export interface AgentStats {
  agentId: string;
  agentName: string;
  runs: number;
  /** Jobs approved without being sent back, out of jobs approved or rejected. */
  firstTime: number;
  decided: number;
  sentBack: number;
  failed: number;
  costUsd: number;
  /** Average time for runs that finished, in milliseconds. */
  averageMs: number | null;
}

/** How each agent has done since a time: volume, quality, failures, time and spend. */
export function agentStats(runs: AgentRun[], since: number): AgentStats[] {
  const recent = runs.filter((run) => run.startedAt >= since);
  const ids = [...new Set(recent.map((run) => run.agentId))];
  return ids
    .map((agentId) => {
      const mine = recent.filter((run) => run.agentId === agentId);
      const record = agentRecord(recent, agentId);
      const timed = mine.filter((run) => run.durationMs !== null || (run.finishedAt !== null && run.status === "done"));
      const total = timed.reduce((sum, run) => sum + (run.durationMs ?? (run.finishedAt! - run.startedAt)), 0);
      return {
        agentId,
        agentName: mine[0].agentName,
        runs: mine.length,
        firstTime: record.approvedFirstTime,
        decided: record.decided,
        sentBack: mine.filter((run) => run.review === "sent_back").length,
        failed: record.failed,
        costUsd: mine.reduce((sum, run) => sum + (run.costUsd ?? 0), 0),
        averageMs: timed.length > 0 ? total / timed.length : null,
      };
    })
    .sort((a, b) => b.runs - a.runs);
}

// ---------- Saved briefs ----------

export const SAVED_BRIEFS = "agent-briefs";

export interface SavedBrief {
  id: string;
  name: string;
  agentId: string;
  brief: string;
  /** What to attach from the app, as context choice names. */
  attach: string[];
}
