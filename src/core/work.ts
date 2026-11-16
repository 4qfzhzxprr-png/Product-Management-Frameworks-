import type { Db } from "./db";
import type { Person } from "./models";

/**
 * Tickets, stories and epics from any issue tracker, in one shape the delivery pages can
 * read. A connector maps its tracker's own fields onto this; nothing here knows which
 * tracker it was.
 */
export const WORK_STATUSES = ["todo", "in_progress", "blocked", "done"] as const;
export type WorkStatus = (typeof WORK_STATUSES)[number];

/** What a connector reports for one ticket or epic. */
export interface WorkRecord {
  /** The tracker's own id or key. One row is kept per source and id. */
  externalId: string;
  /** The tracker's own word for it: "Epic", "Story", "Bug". */
  kind: string;
  /** Epics group items; everything else is an item. */
  level: "epic" | "item";
  title: string;
  /** Opens it in the tracker. */
  url: string;
  status: WorkStatus;
  /** The tracker's own status name, shown as is: "In QA", "Ready for dev". */
  statusLabel: string;
  /** Display name of whoever owns it, or "" if nobody. Epics are matched to PMs by this name. */
  ownerName: string;
  /** The delivery team it belongs to, such as "Onshore" or "Offshore". */
  team: string;
  /** The epic it sits under, by that epic's externalId. */
  parentExternalId: string | null;
  /** The sprint it is in now, if any. */
  sprint: string | null;
  sprintEndsAt: number | null;
  dueAt: number | null;
  createdAt: number;
  /** When it last changed in the tracker. */
  updatedAt: number;
  /** When it was finished, if it is done. Feeds the shipped log. */
  resolvedAt: number | null;
  /** Stuck until product answers a question. */
  waitingOnProduct: boolean;
}

export interface WorkItem extends WorkRecord {
  id: number;
  source: string;
  sourceName: string;
}

interface WorkRow {
  id: number;
  source: string;
  source_name: string;
  external_id: string;
  kind: string;
  level: string;
  title: string;
  url: string;
  status: string;
  status_label: string;
  owner_name: string;
  team: string;
  parent_external_id: string | null;
  sprint: string | null;
  sprint_ends_at: number | null;
  due_at: number | null;
  created_at: number;
  updated_at: number;
  waiting_on_product: number;
  resolved_at: number | null;
}

/** Local storage for synced tickets and epics. The table is created by CaptureStore.open. */
export class WorkStore {
  constructor(private readonly db: Db) {}

  async upsert(record: WorkRecord & { source: string; sourceName: string }): Promise<void> {
    await this.db.run(
      `INSERT INTO work_items
         (source, source_name, external_id, kind, level, title, url, status, status_label, owner_name, team,
          parent_external_id, sprint, sprint_ends_at, due_at, created_at, updated_at, waiting_on_product, resolved_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(source, external_id) DO UPDATE SET
         source_name = excluded.source_name, kind = excluded.kind, level = excluded.level,
         title = excluded.title, url = excluded.url, status = excluded.status,
         status_label = excluded.status_label, owner_name = excluded.owner_name, team = excluded.team,
         parent_external_id = excluded.parent_external_id, sprint = excluded.sprint,
         sprint_ends_at = excluded.sprint_ends_at, due_at = excluded.due_at,
         created_at = excluded.created_at, updated_at = excluded.updated_at,
         waiting_on_product = excluded.waiting_on_product, resolved_at = excluded.resolved_at`,
      [
        record.source, record.sourceName, record.externalId, record.kind, record.level, record.title, record.url,
        record.status, record.statusLabel, record.ownerName, record.team, record.parentExternalId, record.sprint,
        record.sprintEndsAt, record.dueAt, record.createdAt, record.updatedAt, record.waitingOnProduct ? 1 : 0,
        record.resolvedAt,
      ],
    );
  }

  async list(): Promise<WorkItem[]> {
    const rows = await this.db.all<WorkRow>("SELECT * FROM work_items ORDER BY updated_at DESC, id DESC");
    return rows.map((row) => ({
      id: row.id,
      source: row.source,
      sourceName: row.source_name,
      externalId: row.external_id,
      kind: row.kind,
      level: row.level === "epic" ? "epic" : "item",
      title: row.title,
      url: row.url,
      status: (WORK_STATUSES as readonly string[]).includes(row.status) ? (row.status as WorkStatus) : "todo",
      statusLabel: row.status_label,
      ownerName: row.owner_name,
      team: row.team,
      parentExternalId: row.parent_external_id,
      sprint: row.sprint,
      sprintEndsAt: row.sprint_ends_at,
      dueAt: row.due_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      waitingOnProduct: row.waiting_on_product === 1,
      resolvedAt: row.resolved_at,
    }));
  }

  /** Removes everything a connection brought in, for when it is disconnected. */
  async deleteSource(source: string): Promise<void> {
    await this.db.run("DELETE FROM work_items WHERE source = ?", [source]);
  }
}

const DAY = 86_400_000;

function isStuck(item: WorkItem): boolean {
  return item.status !== "done" && (item.status === "blocked" || item.waitingOnProduct);
}

export interface TeamPulse {
  team: string;
  sprint: string;
  sprintEndsAt: number | null;
  total: number;
  done: number;
  inProgress: number;
  blocked: number;
  todo: number;
  /** Items likely to miss the sprint, most urgent first. */
  atRisk: { item: WorkItem; reason: string }[];
}

/** Why an unfinished sprint item may miss, or null if it looks fine. */
function riskReason(item: WorkItem, now: number): string | null {
  if (item.status === "done") return null;
  if (item.waitingOnProduct) return "Waiting on a product answer";
  if (item.status === "blocked") return "Blocked";
  if (item.dueAt !== null && item.dueAt < now) return "Past its due date";
  if (item.status === "todo" && item.sprintEndsAt !== null && item.sprintEndsAt - now < 2 * DAY) {
    return "Not started with the sprint nearly over";
  }
  return null;
}

/** Sprint progress per team, for the items each team has in a sprint right now. */
export function deliveryPulse(items: WorkItem[], now: number): TeamPulse[] {
  const teams = new Map<string, WorkItem[]>();
  for (const item of items) {
    if (item.level !== "item" || item.sprint === null) continue;
    const key = item.team || "No team";
    teams.set(key, [...(teams.get(key) ?? []), item]);
  }

  return [...teams.entries()]
    .map(([team, inSprint]) => {
      const count = (status: WorkStatus) => inSprint.filter((item) => item.status === status).length;
      const ends = inSprint.map((item) => item.sprintEndsAt).filter((end): end is number => end !== null);
      return {
        team,
        sprint: inSprint[0].sprint ?? "",
        sprintEndsAt: ends.length > 0 ? Math.max(...ends) : null,
        total: inSprint.length,
        done: count("done"),
        inProgress: count("in_progress"),
        blocked: count("blocked"),
        todo: count("todo"),
        atRisk: inSprint
          .flatMap((item) => {
            const reason = riskReason(item, now);
            return reason ? [{ item, reason }] : [];
          })
          .sort((a, b) => a.item.updatedAt - b.item.updatedAt),
      };
    })
    .sort((a, b) => a.team.localeCompare(b.team));
}

/** Everything blocked or waiting on a product answer, longest stuck first. */
export function blockers(items: WorkItem[]): WorkItem[] {
  return items.filter((item) => item.level === "item" && isStuck(item)).sort((a, b) => a.updatedAt - b.updatedAt);
}

/** Items in progress that nobody has touched for a week, longest quiet first. */
export function staleItems(items: WorkItem[], now: number, days = 7): WorkItem[] {
  return items
    .filter((item) => item.level === "item" && item.status === "in_progress" && !isStuck(item))
    .filter((item) => now - item.updatedAt >= days * DAY)
    .sort((a, b) => a.updatedAt - b.updatedAt);
}

export type Health = "done" | "off_track" | "at_risk" | "on_track" | "not_started";

export const HEALTH_LABELS: Record<Health, string> = {
  done: "Done",
  off_track: "Off track",
  at_risk: "At risk",
  on_track: "On track",
  not_started: "Not started",
};

export interface EpicHealth {
  epic: WorkItem;
  total: number;
  done: number;
  blocked: number;
  health: Health;
}

/** Each epic with its children's progress and a plain health call. */
export function epicHealth(items: WorkItem[], now: number): EpicHealth[] {
  return items
    .filter((item) => item.level === "epic")
    .map((epic) => {
      const children = items.filter(
        (item) => item.level === "item" && item.source === epic.source && item.parentExternalId === epic.externalId,
      );
      const done = children.filter((child) => child.status === "done").length;
      const blocked = children.filter(isStuck).length;
      const started = done > 0 || children.some((child) => child.status === "in_progress") || epic.status === "in_progress";
      let health: Health;
      if (epic.status === "done" || (children.length > 0 && done === children.length)) health = "done";
      else if (epic.dueAt !== null && epic.dueAt < now) health = "off_track";
      else if (blocked > 0 || isStuck(epic)) health = "at_risk";
      else if (!started) health = "not_started";
      else health = "on_track";
      return { epic, total: children.length, done, blocked, health };
    })
    .sort((a, b) => a.epic.title.localeCompare(b.epic.title));
}

/** The epics a person owns, matched on their name as the tracker shows it. */
export function epicsFor(person: Person, epics: EpicHealth[]): EpicHealth[] {
  const name = person.name.trim().toLowerCase();
  return epics.filter((entry) => entry.epic.ownerName.trim().toLowerCase() === name);
}
