import type { Db } from "./db";
import type { Capture } from "./models";

/**
 * The decision register: decisions are captures of kind "decision"; this adds why, who agreed,
 * whether it still stands, and when to look at it again.
 */

export type DecisionStatus = "standing" | "revisit" | "reversed";

export const DECISION_STATUS_LABELS: Record<DecisionStatus, string> = {
  standing: "Standing",
  revisit: "To revisit",
  reversed: "Reversed",
};

export interface DecisionDetails {
  why: string;
  /** Names, as written: "Jordan, Morgan". */
  agreed: string;
  status: DecisionStatus;
  /** End of the day to look at it again, or null. */
  revisitAt: number | null;
}

export interface Decision {
  capture: Capture;
  details: DecisionDetails;
  /** Past its revisit date and still standing. */
  due: boolean;
}

const EMPTY: DecisionDetails = { why: "", agreed: "", status: "standing", revisitAt: null };

export function decisionRegister(captures: Capture[], details: Map<number, DecisionDetails>, now: number, query = ""): Decision[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  return captures
    .filter((capture) => capture.kind === "decision")
    .map((capture) => {
      const entry = details.get(capture.id) ?? EMPTY;
      return { capture, details: entry, due: entry.status !== "reversed" && entry.revisitAt !== null && entry.revisitAt < now };
    })
    .filter((decision) => terms.every((term) => `${decision.capture.body} ${decision.details.why} ${decision.details.agreed}`.toLowerCase().includes(term)))
    .sort((a, b) => Number(b.due) - Number(a.due) || b.capture.createdAt - a.capture.createdAt);
}

const day = (time: number) => new Date(time).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

export function registerText(decisions: Decision[]): string {
  return [
    "Decision register",
    "",
    ...decisions.map((decision) =>
      [
        `- ${day(decision.capture.createdAt)}: ${decision.capture.body} (${DECISION_STATUS_LABELS[decision.details.status].toLowerCase()})`,
        decision.details.why ? `  Why: ${decision.details.why}` : "",
        decision.details.agreed ? `  Agreed by: ${decision.details.agreed}` : "",
        decision.details.revisitAt ? `  Revisit by: ${day(decision.details.revisitAt)}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    ),
  ].join("\n");
}

interface DetailsRow {
  capture_id: number;
  why: string;
  agreed: string;
  status: string;
  revisit_at: number | null;
}

export class DecisionStore {
  constructor(private readonly db: Db) {}

  async all(): Promise<Map<number, DecisionDetails>> {
    const rows = await this.db.all<DetailsRow>("SELECT * FROM decision_details");
    return new Map(rows.map((row) => [row.capture_id, { why: row.why, agreed: row.agreed, status: row.status as DecisionStatus, revisitAt: row.revisit_at }]));
  }

  async save(captureId: number, details: DecisionDetails): Promise<void> {
    await this.db.run(
      `INSERT INTO decision_details (capture_id, why, agreed, status, revisit_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(capture_id) DO UPDATE SET why = excluded.why, agreed = excluded.agreed, status = excluded.status, revisit_at = excluded.revisit_at`,
      [captureId, details.why.trim(), details.agreed.trim(), details.status, details.revisitAt],
    );
  }
}

export const DECISION_TABLES = [
  `CREATE TABLE IF NOT EXISTS decision_details (
     capture_id INTEGER PRIMARY KEY REFERENCES captures(id) ON DELETE CASCADE,
     why TEXT NOT NULL DEFAULT '',
     agreed TEXT NOT NULL DEFAULT '',
     status TEXT NOT NULL DEFAULT 'standing',
     revisit_at INTEGER
   )`,
];
