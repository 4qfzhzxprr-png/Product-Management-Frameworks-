import type { Db } from "./db";
import { dayStart } from "./insights";
import type { Capture } from "./models";
import { blockers, epicHealth, type EpicHealth, type WorkItem } from "./work";

const DAY = 86_400_000;

/** Points at an epic by the tracker's own key, so a link survives a re-sync. */
export interface EpicRef {
  source: string;
  externalId: string;
}

export interface EpicLink extends EpicRef {
  /** How many tickets the epic had when it was linked; scope growth is measured from here. */
  baselineTotal: number;
  linkedAt: number;
}

/** One of the CPO's stated priorities. */
export interface Priority {
  id: number;
  title: string;
  notes: string;
  position: number;
  epics: EpicLink[];
}

/** Something on the roadmap, usually with a date given to leadership. */
export interface RoadmapItem {
  id: number;
  title: string;
  notes: string;
  /** The date given to leadership: the end of that day, local time. */
  committedAt: number | null;
  /** Leadership was told this date, so a slip should reach the CPO from David first. */
  toLeadership: boolean;
  createdAt: number;
  epics: EpicLink[];
}

type LinkKind = "priority" | "roadmap";

interface LinkRow {
  kind: string;
  owner_id: number;
  source: string;
  external_id: string;
  baseline_total: number;
  linked_at: number;
}

/** Local storage for priorities, the roadmap and the epics linked to them. */
export class LeadershipStore {
  constructor(private readonly db: Db) {}

  private async links(kind: LinkKind): Promise<Map<number, EpicLink[]>> {
    const rows = await this.db.all<LinkRow>("SELECT * FROM epic_links WHERE kind = ? ORDER BY linked_at, external_id", [
      kind,
    ]);
    const byOwner = new Map<number, EpicLink[]>();
    for (const row of rows) {
      byOwner.set(row.owner_id, [
        ...(byOwner.get(row.owner_id) ?? []),
        { source: row.source, externalId: row.external_id, baselineTotal: row.baseline_total, linkedAt: row.linked_at },
      ]);
    }
    return byOwner;
  }

  // Priorities

  async priorities(): Promise<Priority[]> {
    const rows = await this.db.all<{ id: number; title: string; notes: string; position: number }>(
      "SELECT id, title, notes, position FROM priorities ORDER BY position, id",
    );
    const links = await this.links("priority");
    return rows.map((row) => ({ ...row, epics: links.get(row.id) ?? [] }));
  }

  async addPriority(title: string): Promise<Priority> {
    const trimmed = requireText(title, "A priority needs a title.");
    const rows = await this.db.all<{ next: number | null }>("SELECT MAX(position) + 1 AS next FROM priorities");
    const position = rows[0]?.next ?? 0;
    const { lastInsertId } = await this.db.run("INSERT INTO priorities (title, position) VALUES (?, ?)", [
      trimmed,
      position,
    ]);
    return { id: lastInsertId, title: trimmed, notes: "", position, epics: [] };
  }

  async updatePriority(id: number, values: { title: string; notes: string }): Promise<void> {
    await this.db.run("UPDATE priorities SET title = ?, notes = ? WHERE id = ?", [
      requireText(values.title, "A priority needs a title."),
      values.notes.trim(),
      id,
    ]);
  }

  /** Swaps a priority with its neighbour above (-1) or below (+1). */
  async movePriority(id: number, direction: -1 | 1): Promise<void> {
    const list = await this.priorities();
    const index = list.findIndex((priority) => priority.id === id);
    const other = list[index + direction];
    if (index < 0 || !other) return;
    // Renumber first, so equal positions cannot make the swap a no-op.
    for (const [position, priority] of list.entries()) {
      await this.db.run("UPDATE priorities SET position = ? WHERE id = ?", [position, priority.id]);
    }
    await this.db.run("UPDATE priorities SET position = ? WHERE id = ?", [index + direction, id]);
    await this.db.run("UPDATE priorities SET position = ? WHERE id = ?", [index, other.id]);
  }

  async deletePriority(id: number): Promise<void> {
    await this.db.run("DELETE FROM epic_links WHERE kind = 'priority' AND owner_id = ?", [id]);
    await this.db.run("DELETE FROM priorities WHERE id = ?", [id]);
  }

  // Roadmap

  async roadmap(): Promise<RoadmapItem[]> {
    const rows = await this.db.all<{
      id: number;
      title: string;
      notes: string;
      committed_at: number | null;
      to_leadership: number;
      created_at: number;
    }>("SELECT * FROM roadmap_items ORDER BY committed_at IS NULL, committed_at, id");
    const links = await this.links("roadmap");
    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      notes: row.notes,
      committedAt: row.committed_at,
      toLeadership: row.to_leadership === 1,
      createdAt: row.created_at,
      epics: links.get(row.id) ?? [],
    }));
  }

  async addRoadmapItem(values: {
    title: string;
    committedAt: number | null;
    toLeadership: boolean;
    at?: number;
  }): Promise<number> {
    const { lastInsertId } = await this.db.run(
      "INSERT INTO roadmap_items (title, committed_at, to_leadership, created_at) VALUES (?, ?, ?, ?)",
      [
        requireText(values.title, "A roadmap item needs a title."),
        values.committedAt,
        values.toLeadership ? 1 : 0,
        values.at ?? Date.now(),
      ],
    );
    return lastInsertId;
  }

  async updateRoadmapItem(
    id: number,
    values: { title: string; notes: string; committedAt: number | null; toLeadership: boolean },
  ): Promise<void> {
    await this.db.run("UPDATE roadmap_items SET title = ?, notes = ?, committed_at = ?, to_leadership = ? WHERE id = ?", [
      requireText(values.title, "A roadmap item needs a title."),
      values.notes.trim(),
      values.committedAt,
      values.toLeadership ? 1 : 0,
      id,
    ]);
  }

  async deleteRoadmapItem(id: number): Promise<void> {
    await this.db.run("DELETE FROM epic_links WHERE kind = 'roadmap' AND owner_id = ?", [id]);
    await this.db.run("DELETE FROM roadmap_items WHERE id = ?", [id]);
  }

  // Links

  /** Links an epic, remembering its size today so later growth can be spotted. Linking twice keeps the first baseline. */
  async linkEpic(kind: LinkKind, ownerId: number, epic: EpicRef, baselineTotal: number, at = Date.now()): Promise<void> {
    await this.db.run(
      `INSERT INTO epic_links (kind, owner_id, source, external_id, baseline_total, linked_at)
       VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING`,
      [kind, ownerId, epic.source, epic.externalId, baselineTotal, at],
    );
  }

  async unlinkEpic(kind: LinkKind, ownerId: number, epic: EpicRef): Promise<void> {
    await this.db.run("DELETE FROM epic_links WHERE kind = ? AND owner_id = ? AND source = ? AND external_id = ?", [
      kind,
      ownerId,
      epic.source,
      epic.externalId,
    ]);
  }
}

function requireText(value: string, message: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(message);
  return trimmed;
}

export function findEpic(epics: EpicHealth[], ref: EpicRef): EpicHealth | undefined {
  return epics.find((entry) => entry.epic.source === ref.source && entry.epic.externalId === ref.externalId);
}

// ---- Shipped log ----

/** Local midnight on the Monday `weeksAgo` weeks before the week containing `now`. */
export function weekStart(now: number, weeksAgo = 0): number {
  const daysSinceMonday = (new Date(now).getDay() + 6) % 7;
  return dayStart(now, daysSinceMonday + 7 * weeksAgo);
}

export interface ShippedGroup {
  /** The epic the tickets sit under, or null for tickets with none. */
  epic: WorkItem | null;
  items: WorkItem[];
}

export interface Shipped {
  from: number;
  to: number;
  groups: ShippedGroup[];
  /** Epics finished in the period. */
  epicsCompleted: WorkItem[];
  count: number;
}

/** Tickets finished between `from` and `to`, grouped under their epics. */
export function shippedBetween(work: WorkItem[], from: number, to: number): Shipped {
  const finished = (item: WorkItem) =>
    item.status === "done" && item.resolvedAt !== null && item.resolvedAt >= from && item.resolvedAt < to;
  const items = work.filter((item) => item.level === "item" && finished(item));
  const epics = work.filter((item) => item.level === "epic");

  const groups = new Map<string, ShippedGroup>();
  for (const item of items.sort((a, b) => (a.resolvedAt ?? 0) - (b.resolvedAt ?? 0))) {
    const epic =
      epics.find((candidate) => candidate.source === item.source && candidate.externalId === item.parentExternalId) ??
      null;
    const key = epic ? `${epic.source}/${epic.externalId}` : "";
    groups.set(key, { epic, items: [...(groups.get(key)?.items ?? []), item] });
  }

  return {
    from,
    to,
    // Tickets with an epic first, by epic title; loose tickets last.
    groups: [...groups.values()].sort((a, b) =>
      a.epic && b.epic ? a.epic.title.localeCompare(b.epic.title) : a.epic ? -1 : b.epic ? 1 : 0,
    ),
    epicsCompleted: epics.filter(finished),
    count: items.length,
  };
}

// ---- Roadmap vs. reality ----

export type RoadmapState = "done" | "late" | "at_risk" | "on_track" | "not_started" | "unlinked";

export const ROADMAP_LABELS: Record<RoadmapState, string> = {
  done: "Done",
  late: "Late",
  at_risk: "At risk",
  on_track: "On track",
  not_started: "Not started",
  unlinked: "No epics linked",
};

export interface RoadmapStatus {
  item: RoadmapItem;
  epics: EpicHealth[];
  /** Links whose epic is no longer in the tracker. */
  missing: number;
  total: number;
  done: number;
  state: RoadmapState;
  /** Why it is late or at risk, in plain words. Empty when on track. */
  reasons: string[];
}

function shortDate(time: number): string {
  return new Date(time).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Progress of each roadmap item against the date given to leadership, with the reasons it may slip. */
export function roadmapStatus(items: RoadmapItem[], work: WorkItem[], now: number): RoadmapStatus[] {
  const health = epicHealth(work, now);
  return items.map((item) => {
    const linked = item.epics.map((link) => ({ link, health: findEpic(health, link) }));
    const epics = linked.flatMap((entry) => (entry.health ? [entry.health] : []));
    const total = epics.reduce((sum, entry) => sum + entry.total, 0);
    const done = epics.reduce((sum, entry) => sum + entry.done, 0);
    const base = { item, epics, missing: linked.length - epics.length, total, done };

    if (epics.length === 0) {
      return {
        ...base,
        state: "unlinked",
        reasons: item.epics.length > 0 ? ["The linked epics are no longer in the tracker."] : [],
      };
    }
    if (epics.every((entry) => entry.health === "done")) return { ...base, state: "done", reasons: [] };

    const reasons: string[] = [];
    const late = item.committedAt !== null && now > item.committedAt;
    if (late) reasons.push(`Past the date given to leadership (${shortDate(item.committedAt!)}).`);

    for (const entry of epics) {
      if (entry.health === "off_track") reasons.push(`${entry.epic.title} is past its own due date.`);
      if (entry.blocked > 0) {
        reasons.push(`${entry.epic.title} has ${entry.blocked} ${entry.blocked === 1 ? "ticket" : "tickets"} stuck.`);
      }
    }

    const baseline = linked.reduce((sum, entry) => sum + (entry.health ? entry.link.baselineTotal : 0), 0);
    if (baseline > 0 && total - baseline >= Math.max(2, Math.ceil(baseline * 0.2))) {
      reasons.push(`Scope grew from ${baseline} to ${total} tickets since it was linked.`);
    }

    const children = work.filter(
      (ticket) =>
        ticket.level === "item" &&
        epics.some((entry) => entry.epic.source === ticket.source && entry.epic.externalId === ticket.parentExternalId),
    );
    const open = children.filter((ticket) => ticket.status !== "done");
    if (open.length > 0 && open.every((ticket) => now - ticket.updatedAt >= 7 * DAY)) {
      reasons.push("No open ticket has moved in a week.");
    }

    if (item.committedAt !== null && !late && total > 0) {
      const linkedAt = Math.min(...linked.map((entry) => entry.link.linkedAt));
      const span = item.committedAt - linkedAt;
      const elapsed = span > 0 ? (now - linkedAt) / span : 1;
      const progress = done / total;
      if (elapsed > 0.3 && progress < elapsed - 0.25) {
        reasons.push(
          `${Math.round(progress * 100)}% done with ${Math.round(Math.min(elapsed, 1) * 100)}% of the time gone.`,
        );
      }
    }

    const started = done > 0 || children.some((ticket) => ticket.status === "in_progress");
    const state: RoadmapState = late ? "late" : reasons.length > 0 ? "at_risk" : started ? "on_track" : "not_started";
    return { ...base, state, reasons };
  });
}

/** Leadership commitments that are late or at risk: what the CPO should hear about from David first. */
export function noSurprises(statuses: RoadmapStatus[]): RoadmapStatus[] {
  return statuses
    .filter((status) => status.item.toLeadership && (status.state === "late" || status.state === "at_risk"))
    .sort(
      (a, b) =>
        (a.state === "late" ? 0 : 1) - (b.state === "late" ? 0 : 1) ||
        (a.item.committedAt ?? Infinity) - (b.item.committedAt ?? Infinity),
    );
}

// ---- Priority map ----

export interface PriorityView {
  priority: Priority;
  epics: EpicHealth[];
  missing: number;
}

export interface PriorityMap {
  priorities: PriorityView[];
  /** Open epics not linked to any priority: work that may not be serving what the CPO asked for. */
  unmapped: EpicHealth[];
}

export function priorityMap(priorities: Priority[], work: WorkItem[], now: number): PriorityMap {
  const health = epicHealth(work, now);
  const views = priorities.map((priority) => {
    const epics = priority.epics.flatMap((link) => findEpic(health, link) ?? []);
    return { priority, epics, missing: priority.epics.length - epics.length };
  });
  const mapped = new Set(views.flatMap((view) => view.epics.map((entry) => entry.epic.id)));
  return {
    priorities: views,
    unmapped: health.filter((entry) => entry.health !== "done" && !mapped.has(entry.epic.id)),
  };
}

// ---- Weekly update ----

export const UPDATE_SECTIONS = ["shipped", "wins", "risks", "decisions", "next", "asks"] as const;
export type UpdateSectionId = (typeof UPDATE_SECTIONS)[number];

export const SECTION_HELP: Record<UpdateSectionId, string> = {
  shipped: "Tickets finished in the last 7 days, grouped by epic",
  wins: "Captures tagged as wins in the last 7 days",
  risks: "Roadmap items late or at risk, and stuck tickets",
  decisions: "Decisions captured in the last 7 days",
  next: "Roadmap dates in the next two weeks",
  asks: "Open asks of the person you report to",
};

export interface UpdateFormat {
  /** The first line. {date} becomes the Monday of this week. */
  title: string;
  sections: { id: UpdateSectionId; heading: string; on: boolean }[];
}

export function defaultUpdateFormat(): UpdateFormat {
  return {
    title: "Product update, week of {date}",
    sections: [
      { id: "shipped", heading: "Shipped", on: true },
      { id: "wins", heading: "Wins", on: true },
      { id: "risks", heading: "Risks", on: true },
      { id: "decisions", heading: "Decisions", on: true },
      { id: "next", heading: "Coming up", on: true },
      { id: "asks", heading: "What I need from you", on: true },
    ],
  };
}

/** Fills in sections a saved format lacks, so new section types appear for existing users. */
export function completeFormat(saved: Partial<UpdateFormat> | null | undefined): UpdateFormat {
  const base = defaultUpdateFormat();
  const sections = (saved?.sections ?? []).filter((section) => UPDATE_SECTIONS.includes(section.id));
  for (const section of base.sections) {
    if (!sections.some((existing) => existing.id === section.id)) sections.push({ ...section, on: false });
  }
  return { title: saved?.title ?? base.title, sections: saved?.sections ? sections : base.sections };
}

export interface UpdateInput {
  work: WorkItem[];
  captures: Capture[];
  roadmap: RoadmapStatus[];
  /** The person David reports to, for the asks section. */
  managerId: number | null;
  now: number;
  format: UpdateFormat;
}

/** A plain-text weekly update built by rules from what is stored. David edits it and sends it himself. */
export function draftWeeklyUpdate(input: UpdateInput): string {
  const { work, captures, roadmap, managerId, now, format } = input;
  const since = now - 7 * DAY;
  const shipped = shippedBetween(work, since, now + 1);

  const lines: Record<UpdateSectionId, string[]> = {
    shipped: shipped.groups.map((group) => {
      const names = group.items.map((item) => item.title);
      const list = names.length > 4 ? `${names.slice(0, 3).join(", ")} and ${names.length - 3} more` : names.join(", ");
      return `- ${group.epic ? `${group.epic.title}: ` : ""}${list}`;
    }),
    wins: captures.filter((capture) => capture.isWin && capture.createdAt >= since).map((capture) => `- ${capture.body}`),
    risks: [
      ...roadmap
        .filter((status) => status.state === "late" || status.state === "at_risk")
        .map((status) => `- ${status.item.title}: ${status.reasons[0] ?? ROADMAP_LABELS[status.state]}`),
      ...(() => {
        const stuck = blockers(work).length;
        return stuck > 0 ? [`- ${stuck} ${stuck === 1 ? "ticket is" : "tickets are"} blocked or waiting on a product answer.`] : [];
      })(),
    ],
    decisions: captures
      .filter((capture) => capture.kind === "decision" && capture.createdAt >= since)
      .map((capture) => `- ${capture.body}`),
    next: roadmap
      .filter(
        (status) =>
          status.state !== "done" &&
          status.item.committedAt !== null &&
          status.item.committedAt >= now &&
          status.item.committedAt < now + 14 * DAY,
      )
      .map((status) => `- ${status.item.title}, due ${shortDate(status.item.committedAt!)} (${ROADMAP_LABELS[status.state].toLowerCase()})`),
    asks:
      managerId === null
        ? []
        : captures
            .filter((capture) => capture.kind === "ask_of_them" && capture.personId === managerId && capture.doneAt === null)
            .map((capture) => `- ${capture.body}`),
  };

  const out = [format.title.replace("{date}", shortDate(weekStart(now)))];
  for (const section of format.sections.filter((entry) => entry.on)) {
    out.push("", section.heading, ...(lines[section.id].length > 0 ? lines[section.id] : ["- Nothing this week."]));
  }
  return out.join("\n");
}

// ---- The CPO 1:1 ----

export interface SinceLastOneOnOne {
  since: number | null;
  shipped: number;
  wins: Capture[];
  decisions: Capture[];
}

/** What changed since the last 1:1 note with this person, or in the last week if there is none. */
export function sinceLast(lastOneOnOne: Capture | null, work: WorkItem[], captures: Capture[], now: number): SinceLastOneOnOne {
  const since = lastOneOnOne?.createdAt ?? now - 7 * DAY;
  return {
    since: lastOneOnOne?.createdAt ?? null,
    shipped: shippedBetween(work, since, now + 1).count,
    wins: captures.filter((capture) => capture.isWin && capture.createdAt >= since),
    decisions: captures.filter((capture) => capture.kind === "decision" && capture.createdAt >= since),
  };
}

/** Saved in settings under this key. */
export const LEADERSHIP_SETTINGS = "leadership";

export interface LeadershipSettings {
  /** The person David reports to. */
  managerId: number | null;
  format: UpdateFormat;
}
