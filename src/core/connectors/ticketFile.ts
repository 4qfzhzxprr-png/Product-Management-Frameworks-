import type { Connector } from "../connectors";
import type { WorkRecord, WorkStatus } from "../work";

/**
 * Tickets imported from a CSV export. Jira, Linear, Asana, Azure DevOps, GitHub and most other
 * trackers can export one, so this works without API access or admin approval. Columns are
 * matched by name and can be corrected by hand before importing.
 */

// ---------- CSV ----------

/** Splits CSV text into rows of cells. Handles quotes, doubled quotes, line breaks in quotes and a BOM. */
export function parseCsv(text: string): string[][] {
  const source = text.replace(/^﻿/, "");
  const firstLine = source.slice(0, source.search(/\r?\n|$/));
  // Commas unless the header clearly uses semicolons or tabs.
  const counts = { ",": 0, ";": 0, "\t": 0 };
  for (const char of firstLine) if (char in counts) counts[char as keyof typeof counts]++;
  const delimiter = (Object.entries(counts).sort((a, b) => b[1] - a[1])[0][1] > 0
    ? Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0]
    : ",") as string;

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < source.length; index++) {
    const char = source[index];
    if (quoted) {
      if (char === '"' && source[index + 1] === '"') {
        cell += '"';
        index++;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
    } else if (char === '"' && cell === "") {
      quoted = true;
    } else if (char === delimiter) {
      row.push(cell);
      cell = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && source[index + 1] === "\n") index++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((cells) => cells.some((value) => value.trim() !== ""));
}

// ---------- Columns ----------

export const FIELDS = [
  "key",
  "title",
  "kind",
  "status",
  "statusCategory",
  "owner",
  "team",
  "parent",
  "sprint",
  "due",
  "created",
  "updated",
  "resolved",
  "internalId",
] as const;
export type Field = (typeof FIELDS)[number];

export const FIELD_LABELS: Record<Field, string> = {
  key: "Ticket key",
  title: "Title",
  kind: "Type",
  status: "Status",
  statusCategory: "Status category",
  owner: "Owner",
  team: "Team",
  parent: "Epic or parent",
  sprint: "Sprint",
  due: "Due date",
  created: "Created",
  updated: "Last updated",
  resolved: "Finished",
  internalId: "Internal id (for parents given as numbers)",
};

export const REQUIRED: Field[] = ["key", "title", "status"];

// Header names each field usually goes by, best first.
const SYNONYMS: Record<Field, string[]> = {
  key: ["issue key", "key", "ticket key", "id", "issue", "identifier", "task id", "work item id", "number"],
  title: ["summary", "title", "name", "task name", "subject"],
  kind: ["issue type", "type", "work item type", "item type"],
  status: ["status", "state", "workflow state"],
  statusCategory: ["status category"],
  owner: ["assignee", "owner", "assigned to", "assignee name"],
  team: ["team", "squad", "team name", "component/s", "components", "component", "area path"],
  parent: ["parent key", "epic link", "parent", "epic", "parent id", "parent issue", "epic key"],
  sprint: ["sprint", "iteration", "cycle", "iteration path", "milestone"],
  due: ["due date", "due", "due on", "target date"],
  created: ["created", "created at", "created date", "date created"],
  updated: ["updated", "updated at", "last updated", "changed date", "modified"],
  resolved: ["resolved", "resolution date", "completed at", "completed", "done date", "closed at", "closed date"],
  internalId: ["issue id", "internal id"],
};

const normalize = (header: string) => header.trim().toLowerCase().replace(/\s+/g, " ");

/** Which column holds each field: an index into the header row, or -1 for none. */
export type ColumnMap = Record<Field, number>;

/** Guesses the columns from the header names. Jira repeats "Sprint"; the guess keeps all of them. */
export function detectColumns(header: string[]): ColumnMap {
  const names = header.map(normalize);
  const taken = new Set<number>();
  const map = {} as ColumnMap;
  for (const field of FIELDS) {
    map[field] = -1;
    for (const synonym of SYNONYMS[field]) {
      const index = names.findIndex((name, at) => name === synonym && !taken.has(at));
      if (index >= 0) {
        map[field] = index;
        taken.add(index);
        break;
      }
    }
  }
  // "Issue key" beats a bare "ID" for the key; the numeric id then helps resolve parents.
  return map;
}

// ---------- Values ----------

/** The app's status for a tracker's status name (and category, when the export has one). */
export function mapStatus(status: string, category = ""): { status: WorkStatus; waitingOnProduct: boolean } {
  const text = status.trim().toLowerCase();
  const group = category.trim().toLowerCase();
  if (group === "done" || /\b(done|closed|resolved|released|complete|completed|shipped|cancel+ed|won'?t do|merged)\b/.test(text)) {
    return { status: "done", waitingOnProduct: false };
  }
  if (/waiting (on|for) (product|pm|business|decision|answer)|needs? (product|pm|info|input|answer|decision|clarification)|question|product review/.test(text)) {
    return { status: "blocked", waitingOnProduct: true };
  }
  if (/block|impediment|on hold|stuck/.test(text)) return { status: "blocked", waitingOnProduct: false };
  if (group === "in progress" || /progress|review|\bqa\b|test|develop|\bdev\b|doing|started|active|implement|code/.test(text)) {
    return { status: "in_progress", waitingOnProduct: false };
  }
  return { status: "todo", waitingOnProduct: false };
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/**
 * Reads the date formats trackers export: ISO dates and times, Jira's "17/Nov/26 10:15 AM",
 * US numeric dates ("11/17/2026"), and written dates ("Nov 17, 2026"). Times without a zone are
 * read as this Mac's local time. Returns null for anything else.
 */
export function parseDate(value: string): number | null {
  const text = value.trim();
  if (!text) return null;

  let match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (match) return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])).getTime();

  match = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?\s*(Z|[+-]\d{2}:?\d{2})?$/.exec(text);
  if (match) {
    const [, y, mo, d, h, mi, s, zone] = match;
    if (!zone) return new Date(+y, +mo - 1, +d, +h, +mi, +(s ?? 0)).getTime();
    const offset = zone === "Z" ? "Z" : `${zone.slice(0, 3)}:${zone.slice(-2)}`;
    return Date.parse(`${y}-${mo}-${d}T${h}:${mi}:${s ?? "00"}${offset}`);
  }

  // Jira: 17/Nov/26 10:15 AM, or 17/Nov/2026 10:15
  match = /^(\d{1,2})[/ -]([A-Za-z]{3})[a-z]*[/ -](\d{2,4})(?:\s+(\d{1,2}):(\d{2})\s*([AaPp][Mm])?)?$/.exec(text);
  if (match) {
    const month = MONTHS.indexOf(match[2].toLowerCase());
    if (month < 0) return null;
    const year = match[3].length === 2 ? 2000 + Number(match[3]) : Number(match[3]);
    return new Date(year, month, Number(match[1]), to24(match[4], match[6]), Number(match[5] ?? 0)).getTime();
  }

  // US: 11/17/2026 or 11/17/26, optionally with a time
  match = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:,?\s+(\d{1,2}):(\d{2})(?::\d{2})?\s*([AaPp][Mm])?)?$/.exec(text);
  if (match) {
    const year = match[3].length === 2 ? 2000 + Number(match[3]) : Number(match[3]);
    return new Date(year, Number(match[1]) - 1, Number(match[2]), to24(match[4], match[6]), Number(match[5] ?? 0)).getTime();
  }

  // Written: Nov 17, 2026 or 17 Nov 2026
  match = /^([A-Za-z]{3})[a-z]*\.? (\d{1,2}),? (\d{4})$/.exec(text) ?? null;
  if (match) {
    const month = MONTHS.indexOf(match[1].toLowerCase());
    return month < 0 ? null : new Date(Number(match[3]), month, Number(match[2])).getTime();
  }
  match = /^(\d{1,2}) ([A-Za-z]{3})[a-z]* (\d{4})$/.exec(text);
  if (match) {
    const month = MONTHS.indexOf(match[2].toLowerCase());
    return month < 0 ? null : new Date(Number(match[3]), month, Number(match[1])).getTime();
  }
  return null;
}

function to24(hour: string | undefined, meridiem: string | undefined): number {
  if (hour === undefined) return 0;
  const value = Number(hour) % 12;
  if (!meridiem) return Number(hour);
  return meridiem.toLowerCase() === "pm" ? value + 12 : value;
}

// ---------- Rows to tickets ----------

export interface ImportOptions {
  columns: ColumnMap;
  /** A link to each ticket, with {key} where the ticket key goes, such as "https://acme.atlassian.net/browse/{key}". */
  linkPattern: string;
  now: number;
}

export interface ImportResult {
  records: WorkRecord[];
  /** Rows left out, with why, by row number in the file (the header is row 1). */
  skipped: { row: number; reason: string }[];
  /** Fields with no column chosen that the pages would use. */
  missing: Field[];
}

/** Turns CSV rows (header first) into tickets for the app. */
export function buildRecords(rows: string[][], options: ImportOptions): ImportResult {
  const { columns, linkPattern, now } = options;
  const [header, ...data] = rows;
  const cell = (row: string[], field: Field) => (columns[field] >= 0 ? (row[columns[field]] ?? "").trim() : "");

  // Jira repeats the Sprint column, one per sprint a ticket has been in; the last filled one is current.
  const sprintColumns =
    columns.sprint >= 0
      ? header.map((name, index) => (normalize(name) === normalize(header[columns.sprint]) ? index : -1)).filter((index) => index >= 0)
      : [];

  // Parents are sometimes given as internal numeric ids; translate those to keys.
  const keyByInternal = new Map<string, string>();
  if (columns.internalId >= 0) {
    for (const row of data) keyByInternal.set(cell(row, "internalId"), cell(row, "key"));
  }

  const records: WorkRecord[] = [];
  const skipped: ImportResult["skipped"] = [];
  const seen = new Set<string>();
  data.forEach((row, index) => {
    const line = index + 2;
    const key = cell(row, "key");
    const title = cell(row, "title");
    if (!key) return skipped.push({ row: line, reason: "No ticket key" });
    if (!title) return skipped.push({ row: line, reason: "No title" });
    if (seen.has(key)) return skipped.push({ row: line, reason: `Ticket ${key} appears twice` });
    seen.add(key);

    const kind = cell(row, "kind");
    const statusLabel = cell(row, "status");
    const { status, waitingOnProduct } = mapStatus(statusLabel, cell(row, "statusCategory"));
    const parentRaw = cell(row, "parent");
    const sprints = sprintColumns.map((column) => (row[column] ?? "").trim()).filter(Boolean);
    const created = parseDate(cell(row, "created")) ?? now;
    const updated = parseDate(cell(row, "updated")) ?? created;
    const resolved = parseDate(cell(row, "resolved"));

    records.push({
      externalId: key,
      kind: kind || "Ticket",
      level: /epic|initiative|feature set/i.test(kind) ? "epic" : "item",
      title,
      url: linkPattern.includes("{key}") ? linkPattern.replace("{key}", encodeURIComponent(key)) : "",
      status,
      statusLabel: statusLabel || "",
      ownerName: cell(row, "owner"),
      team: cell(row, "team"),
      parentExternalId: parentRaw ? (keyByInternal.get(parentRaw) ?? parentRaw) : null,
      sprint: sprints.length > 0 ? sprints[sprints.length - 1] : null,
      // Sprint end dates are rarely in exports.
      sprintEndsAt: null,
      dueAt: parseDate(cell(row, "due")),
      createdAt: created,
      updatedAt: updated,
      waitingOnProduct,
      // A finished ticket without a finish date counts as finished when it was last updated.
      resolvedAt: status === "done" ? (resolved ?? updated) : null,
    });
  });

  const useful: Field[] = ["owner", "team", "parent", "sprint", "updated", "resolved"];
  return { records, skipped, missing: useful.filter((field) => columns[field] < 0) };
}

/** Stored as the connection's config so a newer file imports the same way. */
export interface ImportSettings {
  columns: ColumnMap;
  linkPattern: string;
  fileName: string;
  importedAt: number;
  count: number;
}

export const ticketFileConnector: Connector = {
  id: "ticket-file",
  name: "Tickets from a file",
  description:
    "Import tickets and epics from a CSV export of any tracker: Jira, Linear, Asana, Azure DevOps, GitHub and others. No API access or admin approval needed. Import a newer export whenever you want fresh numbers; tickets missing from it are removed.",
  fields: [],
  manual: true,
  // Imports happen on the Connections page; there is nothing to fetch on a timer.
  async sync() {
    return { activities: [] };
  },
};
