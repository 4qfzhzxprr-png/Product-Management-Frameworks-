import { CHANGING_TOOLS, parseStreamLine, READ_ONLY_TOOLS, type AgentRunner, type RunResult } from "./agents";
import type { Db } from "./db";

/**
 * The one way the app asks Claude something. Every call runs Claude Code on David's Mac with
 * his own login and no tools, is checked for sensitive data first, and is written to the log.
 * Agent runs go through the same check and log (see useAgents).
 */

// ---------- Sensitive data ----------

export interface SensitiveFinding {
  label: string;
  /** The match with most of it hidden, to show without repeating it. */
  sample: string;
}

const mask = (text: string) => (text.length <= 4 ? "••••" : `${text.slice(0, 2)}${"•".repeat(Math.min(8, text.length - 4))}${text.slice(-2)}`);

const PATTERNS: { label: string; pattern: RegExp }[] = [
  { label: "Social Security number", pattern: /\b\d{3}-\d{2}-\d{4}\b/g },
  { label: "Medical record or member number", pattern: /\b(?:MRN|medical record(?: number)?|member (?:id|number)|patient id|subscriber id)\b[\s:#-]*[A-Z0-9-]{4,}/gi },
  { label: "Date of birth", pattern: /\b(?:DOB|date of birth|born on)\b[\s:]*[\d/.-]{6,10}/gi },
  // Only "Patient: First Last" or "Patient name First Last", so product names like Patient Portal pass.
  { label: "Patient name", pattern: /\b[Pp]atient(?:\s*:|\s+[Nn]ame\s*:?)\s*(?:Mr\.?|Mrs\.?|Ms\.?)?\s?[A-Z][a-z]+ [A-Z][a-z]+/g },
  { label: "Card number", pattern: /\b(?:\d[ -]?){15,16}\b/g },
  { label: "Phone number", pattern: /(?:\+1[\s.-]?)?\(?\b\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/g },
  { label: "Email address", pattern: /\b[\w.+-]+@[\w-]+(?:\.[\w-]+)+\b/g },
];

/**
 * Finds what looks like patient or customer identifiers. It errs toward warning: a false alarm
 * costs a click, a miss could send health data out. Work email addresses also count, so David
 * decides each time.
 */
export function findSensitive(text: string): SensitiveFinding[] {
  const found: SensitiveFinding[] = [];
  const seen = new Set<string>();
  for (const { label, pattern } of PATTERNS) {
    for (const match of text.matchAll(pattern)) {
      const value = match[0].trim();
      const key = `${label}:${value}`;
      // A card-number match inside an already-found SSN or phone is the same thing.
      if (seen.has(key) || found.some((entry) => entry.label !== label && value.includes(entry.sample.replace(/•+/g, "")))) continue;
      seen.add(key);
      found.push({ label, sample: mask(value) });
    }
  }
  return found.slice(0, 12);
}

// ---------- Asking ----------

/** Every tool Claude Code offers by name, all switched off for a plain question. */
export const ALL_TOOLS = [...READ_ONLY_TOOLS, ...CHANGING_TOOLS];

/** Why a call is made, shown in the log and used by the preview to pick a sample answer. */
export type Purpose =
  | "meeting-actions"
  | "exec-translate"
  | "objection-prep"
  | "preread-draft"
  | "spec-check"
  | "review-prep"
  | "agent";

export const PURPOSE_LABELS: Record<Purpose, string> = {
  "meeting-actions": "Meeting notes into actions",
  "exec-translate": "Exec translator",
  "objection-prep": "Objection prep",
  "preread-draft": "Pre-read draft",
  "spec-check": "Spec check",
  "review-prep": "Review prep",
  agent: "Agent run",
};

/** Arguments for a question with no tools. The first line of the system prompt names the purpose. */
export function askArgs(purpose: Purpose, system: string): string[] {
  return [
    "-p",
    "--output-format",
    "stream-json",
    "--verbose",
    "--append-system-prompt",
    `Purpose: ${purpose}\n${system.trim()}`,
    "--disallowedTools",
    ALL_TOOLS.join(","),
  ];
}

export class SensitiveDataError extends Error {
  constructor(readonly findings: SensitiveFinding[]) {
    super(`This looks like it contains ${findings.map((finding) => finding.label.toLowerCase()).join(", ")}.`);
  }
}

/**
 * Asks Claude once and returns the answer. Throws SensitiveDataError when the text looks
 * sensitive, unless David has confirmed (`allowSensitive`).
 */
export async function askClaude(
  deps: { runner: AgentRunner; log: ClaudeLog; program: string; workFolder: string },
  request: { purpose: Purpose; system: string; prompt: string; allowSensitive?: boolean },
): Promise<RunResult> {
  const findings = findSensitive(`${request.prompt}\n${request.system}`);
  if (findings.length > 0 && !request.allowSensitive) throw new SensitiveDataError(findings);
  const logId = await deps.log.add({ purpose: request.purpose, system: request.system, prompt: request.prompt, warnings: findings });
  let result: RunResult | null = null;
  try {
    const exit = await deps.runner.start(
      // Asks use ids far above agent runs, so their output events never mix.
      { runId: 1_000_000_000 + logId, program: deps.program, args: askArgs(request.purpose, request.system), prompt: request.prompt, cwd: deps.workFolder },
      (line) => {
        for (const event of parseStreamLine(line)) if (event && "result" in event) result = event.result;
      },
    );
    const finished = result as RunResult | null;
    if (!finished || finished.isError) {
      const reason = finished?.output || exit.stderr.trim().split("\n").slice(-4).join("\n") || "Claude Code did not answer.";
      throw new Error(reason);
    }
    await deps.log.finish(logId, { status: "done", response: finished.output, costUsd: finished.costUsd, durationMs: finished.durationMs });
    return finished;
  } catch (cause) {
    await deps.log.finish(logId, { status: "failed", response: cause instanceof Error ? cause.message : String(cause) });
    throw cause;
  }
}

/** Pulls the first JSON array or object out of an answer that may have prose or a code fence around it. */
export function extractJson<T>(text: string): T | null {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  const body = fenced ? fenced[1] : text;
  const start = body.search(/[[{]/);
  if (start < 0) return null;
  const open = body[start];
  const close = open === "[" ? "]" : "}";
  let depth = 0;
  let inString = false;
  for (let index = start; index < body.length; index++) {
    const char = body[index];
    if (inString) {
      if (char === "\\") index++;
      else if (char === '"') inString = false;
    } else if (char === '"') inString = true;
    else if (char === open) depth++;
    else if (char === close && --depth === 0) {
      try {
        return JSON.parse(body.slice(start, index + 1)) as T;
      } catch {
        return null;
      }
    }
  }
  return null;
}

// ---------- The log ----------

export interface ClaudeLogEntry {
  id: number;
  at: number;
  purpose: Purpose;
  /** For agent runs, the agent and its run. */
  agentName: string;
  runId: number | null;
  system: string;
  prompt: string;
  response: string;
  status: "sent" | "done" | "failed";
  /** What the sensitive-data check flagged and David chose to send anyway. */
  warnings: SensitiveFinding[];
  costUsd: number | null;
  durationMs: number | null;
}

interface LogRow {
  id: number;
  at: number;
  purpose: string;
  agent_name: string;
  run_id: number | null;
  system: string;
  prompt: string;
  response: string;
  status: string;
  warnings: string;
  cost_usd: number | null;
  duration_ms: number | null;
}

/** Everything sent to Claude, kept on this Mac so David (or IT) can see exactly what left it. */
export class ClaudeLog {
  constructor(private readonly db: Db) {}

  async add(entry: { purpose: Purpose; system: string; prompt: string; warnings?: SensitiveFinding[]; agentName?: string; runId?: number | null; at?: number }): Promise<number> {
    const { lastInsertId } = await this.db.run(
      `INSERT INTO claude_log (at, purpose, agent_name, run_id, system, prompt, response, status, warnings)
       VALUES (?, ?, ?, ?, ?, ?, '', 'sent', ?)`,
      [entry.at ?? Date.now(), entry.purpose, entry.agentName ?? "", entry.runId ?? null, entry.system, entry.prompt, JSON.stringify(entry.warnings ?? [])],
    );
    return lastInsertId;
  }

  async finish(id: number, outcome: { status: "done" | "failed"; response: string; costUsd?: number | null; durationMs?: number | null }): Promise<void> {
    await this.db.run("UPDATE claude_log SET status = ?, response = ?, cost_usd = ?, duration_ms = ? WHERE id = ?", [
      outcome.status,
      outcome.response,
      outcome.costUsd ?? null,
      outcome.durationMs ?? null,
      id,
    ]);
  }

  async list(limit = 200): Promise<ClaudeLogEntry[]> {
    const rows = await this.db.all<LogRow>("SELECT * FROM claude_log ORDER BY at DESC, id DESC LIMIT ?", [limit]);
    return rows.map((row) => ({
      id: row.id,
      at: row.at,
      purpose: row.purpose as Purpose,
      agentName: row.agent_name,
      runId: row.run_id,
      system: row.system,
      prompt: row.prompt,
      response: row.response,
      status: row.status as ClaudeLogEntry["status"],
      warnings: (() => {
        try {
          return JSON.parse(row.warnings) as SensitiveFinding[];
        } catch {
          return [];
        }
      })(),
      costUsd: row.cost_usd,
      durationMs: row.duration_ms,
    }));
  }

  async clear(): Promise<void> {
    await this.db.run("DELETE FROM claude_log");
  }

  /** Total spend reported by Claude Code since a time. */
  async costSince(since: number): Promise<number> {
    const rows = await this.db.all<{ total: number | null }>("SELECT SUM(cost_usd) AS total FROM claude_log WHERE at >= ?", [since]);
    return rows[0]?.total ?? 0;
  }
}

export const CLAUDE_LOG_TABLES = [
  `CREATE TABLE IF NOT EXISTS claude_log (
     id INTEGER PRIMARY KEY,
     at INTEGER NOT NULL,
     purpose TEXT NOT NULL,
     agent_name TEXT NOT NULL DEFAULT '',
     run_id INTEGER,
     system TEXT NOT NULL DEFAULT '',
     prompt TEXT NOT NULL,
     response TEXT NOT NULL DEFAULT '',
     status TEXT NOT NULL,
     warnings TEXT NOT NULL DEFAULT '[]',
     cost_usd REAL,
     duration_ms INTEGER
   )`,
  `CREATE INDEX IF NOT EXISTS claude_log_at ON claude_log(at DESC)`,
];
