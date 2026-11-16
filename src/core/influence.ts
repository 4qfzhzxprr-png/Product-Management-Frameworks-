import type { Db } from "./db";
import { dayStart } from "./insights";
import type { Capture, Person, Project } from "./models";

const DAY = 86_400_000;

// ---------- Narrative bank ----------

export const STORY_TYPES = ["win", "evidence", "metric"] as const;
export type StoryType = (typeof STORY_TYPES)[number];

export const STORY_LABELS: Record<StoryType, string> = {
  win: "Win",
  evidence: "Customer evidence",
  metric: "Metric",
};

/** Where a capture belongs in the narrative bank, or null if it does not. */
export function storyType(capture: Capture): StoryType | null {
  if (capture.kind === "metric") return "metric";
  if (capture.kind === "evidence") return "evidence";
  if (capture.isWin) return "win";
  return null;
}

export interface NarrativeFilter {
  type?: StoryType;
  projectId?: number;
  /** Only entries captured in the last this many days. */
  days?: number;
}

/** Wins, customer evidence and metrics, newest first: the raw material for a deck. */
export function narrativeBank(captures: Capture[], filter: NarrativeFilter, now: number): Capture[] {
  const since = filter.days === undefined ? -Infinity : dayStart(now, filter.days - 1);
  return captures
    .filter((capture) => {
      const type = storyType(capture);
      return (
        type !== null &&
        (filter.type === undefined || type === filter.type) &&
        (filter.projectId === undefined || capture.projectId === filter.projectId) &&
        capture.createdAt >= since
      );
    })
    .sort((a, b) => b.createdAt - a.createdAt);
}

function shortDate(time: number): string {
  return new Date(time).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

/** Plain text grouped by project, ready to paste into a deck or a doc. */
export function exportNarrative(entries: Capture[], projects: Project[]): string {
  const groups = new Map<string, Capture[]>();
  for (const entry of entries) {
    const name = projects.find((project) => project.id === entry.projectId)?.name ?? "General";
    groups.set(name, [...(groups.get(name) ?? []), entry]);
  }
  const names = [...groups.keys()].sort((a, b) => (a === "General" ? 1 : b === "General" ? -1 : a.localeCompare(b)));
  return names
    .map((name) =>
      [
        name,
        ...groups
          .get(name)!
          .map((entry) => `- ${STORY_LABELS[storyType(entry)!]}: ${entry.body} (${shortDate(entry.createdAt)})`),
      ].join("\n"),
    )
    .join("\n\n");
}

// ---------- Stakeholder map ----------

/** What David knows about one executive. Private: stored on this Mac only. */
export interface StakeholderProfile {
  personId: number;
  /** Their role, such as "CFO". */
  title: string;
  goals: string;
  concerns: string;
  updatedAt: number;
}

export interface Stakeholder {
  person: Person;
  profile: StakeholderProfile;
  /** The most recent thing they asked David for, open or not. */
  lastAsk: Capture | null;
  /** What they asked for that David has not done yet, oldest first. */
  openAsks: Capture[];
  /** When anything was last captured about them. */
  lastContactAt: number | null;
  /** True when nothing has been captured about them for 30 days. */
  quiet: boolean;
}

export const QUIET_DAYS = 30;

/** Each executive with their goals and concerns, what they last asked about, and how long it has been. */
export function stakeholderMap(
  profiles: StakeholderProfile[],
  people: Person[],
  captures: Capture[],
  now: number,
): Stakeholder[] {
  return profiles
    .flatMap((profile) => {
      const person = people.find((candidate) => candidate.id === profile.personId);
      if (!person) return [];
      const theirs = captures.filter((capture) => capture.personId === person.id);
      const asks = theirs.filter((capture) => capture.kind === "ask_of_me").sort((a, b) => b.createdAt - a.createdAt);
      const lastContactAt = theirs.reduce<number | null>(
        (latest, capture) => (latest === null || capture.createdAt > latest ? capture.createdAt : latest),
        null,
      );
      return [
        {
          person,
          profile,
          lastAsk: asks[0] ?? null,
          openAsks: asks.filter((ask) => ask.doneAt === null).reverse(),
          lastContactAt,
          quiet: lastContactAt === null || now - lastContactAt >= QUIET_DAYS * DAY,
        },
      ];
    })
    .sort((a, b) => b.openAsks.length - a.openAsks.length || a.person.name.localeCompare(b.person.name));
}

// ---------- Pre-reads ----------

export interface Preread {
  id: number;
  title: string;
  /** Who the meeting is with. */
  personId: number | null;
  /** The decision or help wanted, in one or two sentences. Goes first. */
  ask: string;
  whyNow: string;
  background: string;
  options: string;
  recommendation: string;
  /** Narrative bank entries to quote, by capture id. */
  evidenceIds: number[];
  createdAt: number;
  updatedAt: number;
}

export type PrereadFields = Pick<Preread, "title" | "personId" | "ask" | "whyNow" | "background" | "options" | "recommendation" | "evidenceIds">;

/** About one page of text. */
export const ONE_PAGE_WORDS = 450;

export function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

/**
 * A one-page brief for an executive meeting, with the ask stated first. Built from a template:
 * empty sections are left out, and evidence is quoted from the narrative bank.
 */
export function buildPreread(
  preread: PrereadFields,
  context: { audience: Stakeholder | null; evidence: Capture[]; now: number },
): string {
  const audience = context.audience
    ? `${context.audience.person.name}${context.audience.profile.title ? `, ${context.audience.profile.title}` : ""}`
    : null;
  const lines = [`Pre-read: ${preread.title.trim() || "Untitled"}`];
  lines.push([audience ? `For ${audience}` : null, shortDate(context.now)].filter(Boolean).join(" · "));

  const section = (heading: string, body: string) => {
    if (body.trim()) lines.push("", heading, body.trim());
  };
  section("The ask", preread.ask);
  section("Why now", preread.whyNow);
  section("Background", preread.background);
  section("Options", preread.options);
  section("Recommendation", preread.recommendation);

  const evidence = preread.evidenceIds
    .map((id) => context.evidence.find((entry) => entry.id === id))
    .filter((entry): entry is Capture => entry !== undefined);
  if (evidence.length > 0) {
    lines.push("", "Evidence", ...evidence.map((entry) => `- ${entry.body}`));
  }
  return lines.join("\n");
}

/** What a pre-read is missing before it is ready to send. */
export function prereadGaps(preread: PrereadFields): string[] {
  const gaps: string[] = [];
  if (!preread.ask.trim()) gaps.push("State the ask. It goes first.");
  if (preread.personId === null) gaps.push("Choose who the meeting is with.");
  if (!preread.recommendation.trim()) gaps.push("Say what you recommend.");
  return gaps;
}

interface PrereadRow {
  id: number;
  title: string;
  person_id: number | null;
  ask: string;
  why_now: string;
  background: string;
  options: string;
  recommendation: string;
  evidence: string;
  created_at: number;
  updated_at: number;
}

function parseIds(value: string): number[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((id): id is number => typeof id === "number") : [];
  } catch {
    return [];
  }
}

/** Local storage for stakeholder profiles and pre-reads. The tables are created by CaptureStore.open. */
export class InfluenceStore {
  constructor(private readonly db: Db) {}

  async stakeholders(): Promise<StakeholderProfile[]> {
    const rows = await this.db.all<{ person_id: number; title: string; goals: string; concerns: string; updated_at: number }>(
      "SELECT * FROM stakeholders",
    );
    return rows.map((row) => ({
      personId: row.person_id,
      title: row.title,
      goals: row.goals,
      concerns: row.concerns,
      updatedAt: row.updated_at,
    }));
  }

  /** Adds a person to the map, or updates what is known about them. */
  async saveStakeholder(
    personId: number,
    values: { title: string; goals: string; concerns: string },
    at = Date.now(),
  ): Promise<void> {
    await this.db.run(
      `INSERT INTO stakeholders (person_id, title, goals, concerns, updated_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(person_id) DO UPDATE SET
         title = excluded.title, goals = excluded.goals, concerns = excluded.concerns, updated_at = excluded.updated_at`,
      [personId, values.title.trim(), values.goals.trim(), values.concerns.trim(), at],
    );
  }

  /** Takes a person off the map. Their captures are kept. */
  async removeStakeholder(personId: number): Promise<void> {
    await this.db.run("DELETE FROM stakeholders WHERE person_id = ?", [personId]);
  }

  /** Most recently changed first. */
  async prereads(): Promise<Preread[]> {
    const rows = await this.db.all<PrereadRow>("SELECT * FROM prereads ORDER BY updated_at DESC, id DESC");
    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      personId: row.person_id,
      ask: row.ask,
      whyNow: row.why_now,
      background: row.background,
      options: row.options,
      recommendation: row.recommendation,
      evidenceIds: parseIds(row.evidence),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  async createPreread(title: string, personId: number | null, at = Date.now()): Promise<number> {
    const trimmed = title.trim();
    if (!trimmed) throw new Error("A pre-read needs a title.");
    const { lastInsertId } = await this.db.run(
      "INSERT INTO prereads (title, person_id, created_at, updated_at) VALUES (?, ?, ?, ?)",
      [trimmed, personId, at, at],
    );
    return lastInsertId;
  }

  async savePreread(id: number, fields: PrereadFields, at = Date.now()): Promise<void> {
    const title = fields.title.trim();
    if (!title) throw new Error("A pre-read needs a title.");
    await this.db.run(
      `UPDATE prereads SET title = ?, person_id = ?, ask = ?, why_now = ?, background = ?, options = ?,
         recommendation = ?, evidence = ?, updated_at = ? WHERE id = ?`,
      [
        title, fields.personId, fields.ask, fields.whyNow, fields.background, fields.options,
        fields.recommendation, JSON.stringify(fields.evidenceIds), at, id,
      ],
    );
  }

  async deletePreread(id: number): Promise<void> {
    await this.db.run("DELETE FROM prereads WHERE id = ?", [id]);
  }
}
