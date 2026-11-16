import type { Db, SqlParam } from "./db";
import { ConnectionStore } from "./connectors";
import { SettingsStore } from "./handoff";
import { ItemStore } from "./itemStore";
import { LeadershipStore } from "./leadership";
import { WorkStore } from "./work";
import {
  CAPTURE_KINDS,
  isActionable,
  waitsOnMe,
  type Capture,
  type CaptureFilter,
  type CaptureKind,
  type NewCapture,
  type Person,
  type Project,
} from "./models";

type Step = string | ((db: Db) => Promise<void>);

/**
 * Adds a column unless it is already there, so the step can safely run twice. The main
 * window and the capture window both open the database at launch, so on a new install two
 * copies of this can run at once; the one that loses the race finds the column added.
 */
function addColumn(table: string, column: string, type: string): Step {
  const exists = async (db: Db) =>
    (await db.all<{ name: string }>(`PRAGMA table_info(${table})`)).some((existing) => existing.name === column);
  return async (db) => {
    if (await exists(db)) return;
    try {
      await db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
    } catch (cause) {
      if (!(await exists(db))) throw cause;
    }
  };
}

const MIGRATIONS: Step[][] = [
  [
    `CREATE TABLE IF NOT EXISTS people (
       id INTEGER PRIMARY KEY,
       name TEXT NOT NULL UNIQUE COLLATE NOCASE,
       is_pm INTEGER NOT NULL DEFAULT 0
     )`,
    `CREATE TABLE IF NOT EXISTS projects (
       id INTEGER PRIMARY KEY,
       name TEXT NOT NULL UNIQUE COLLATE NOCASE
     )`,
    `CREATE TABLE IF NOT EXISTS captures (
       id INTEGER PRIMARY KEY,
       created_at INTEGER NOT NULL,
       kind TEXT NOT NULL,
       body TEXT NOT NULL,
       person_id INTEGER REFERENCES people(id) ON DELETE SET NULL,
       project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
       is_win INTEGER NOT NULL DEFAULT 0,
       done_at INTEGER
     )`,
    `CREATE INDEX IF NOT EXISTS captures_created ON captures(created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS captures_person ON captures(person_id)`,
    `CREATE INDEX IF NOT EXISTS captures_project ON captures(project_id)`,
  ],
  [
    // Activity synced from company systems; see items.ts.
    `CREATE TABLE IF NOT EXISTS items (
       id INTEGER PRIMARY KEY,
       source TEXT NOT NULL,
       external_id TEXT NOT NULL,
       type TEXT NOT NULL,
       title TEXT NOT NULL,
       snippet TEXT NOT NULL DEFAULT '',
       author TEXT NOT NULL DEFAULT '',
       url TEXT NOT NULL DEFAULT '',
       occurred_at INTEGER NOT NULL,
       addressed_to_me INTEGER NOT NULL DEFAULT 0,
       from_me INTEGER NOT NULL DEFAULT 0,
       bucket TEXT NOT NULL,
       bucket_override TEXT,
       dismissed_at INTEGER,
       UNIQUE (source, external_id)
     )`,
    `CREATE INDEX IF NOT EXISTS items_occurred ON items(occurred_at DESC)`,
  ],
  [
    // Sources became open-ended: any connection, not a fixed list of systems. The first items
    // table is replaced outright; nothing could have written to it, as no connector existed.
    `DROP TABLE IF EXISTS items`,
    `CREATE TABLE IF NOT EXISTS items (
       id INTEGER PRIMARY KEY,
       source TEXT NOT NULL,
       source_name TEXT NOT NULL DEFAULT '',
       external_id TEXT NOT NULL,
       kind TEXT NOT NULL DEFAULT '',
       title TEXT NOT NULL,
       snippet TEXT NOT NULL DEFAULT '',
       author TEXT NOT NULL DEFAULT '',
       url TEXT NOT NULL DEFAULT '',
       occurred_at INTEGER NOT NULL,
       addressed_to_me INTEGER NOT NULL DEFAULT 0,
       from_me INTEGER NOT NULL DEFAULT 0,
       bucket TEXT NOT NULL,
       bucket_override TEXT,
       dismissed_at INTEGER,
       UNIQUE (source, external_id)
     )`,
    `CREATE INDEX IF NOT EXISTS items_occurred ON items(occurred_at DESC)`,
    // One row per connected system. Secrets are not stored here; they go in the Keychain.
    `CREATE TABLE IF NOT EXISTS connections (
       id INTEGER PRIMARY KEY,
       connector_id TEXT NOT NULL,
       name TEXT NOT NULL,
       config TEXT NOT NULL DEFAULT '{}',
       enabled INTEGER NOT NULL DEFAULT 1,
       cursor TEXT,
       last_sync_at INTEGER,
       last_error TEXT
     )`,
  ],
  [
    // Tickets and epics from any issue tracker; see work.ts.
    `CREATE TABLE IF NOT EXISTS work_items (
       id INTEGER PRIMARY KEY,
       source TEXT NOT NULL,
       source_name TEXT NOT NULL DEFAULT '',
       external_id TEXT NOT NULL,
       kind TEXT NOT NULL DEFAULT '',
       level TEXT NOT NULL DEFAULT 'item',
       title TEXT NOT NULL,
       url TEXT NOT NULL DEFAULT '',
       status TEXT NOT NULL,
       status_label TEXT NOT NULL DEFAULT '',
       owner_name TEXT NOT NULL DEFAULT '',
       team TEXT NOT NULL DEFAULT '',
       parent_external_id TEXT,
       sprint TEXT,
       sprint_ends_at INTEGER,
       due_at INTEGER,
       created_at INTEGER NOT NULL,
       updated_at INTEGER NOT NULL,
       waiting_on_product INTEGER NOT NULL DEFAULT 0,
       UNIQUE (source, external_id)
     )`,
  ],
  // A date a commitment or ask was promised for.
  [addColumn("captures", "due_at", "INTEGER")],
  // App settings, one JSON value per key.
  [`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`],
  // Phase 3: when tickets were finished, the CPO's priorities, and the roadmap given to leadership.
  [
    addColumn("work_items", "resolved_at", "INTEGER"),
    `CREATE TABLE IF NOT EXISTS priorities (
       id INTEGER PRIMARY KEY,
       title TEXT NOT NULL,
       notes TEXT NOT NULL DEFAULT '',
       position INTEGER NOT NULL DEFAULT 0
     )`,
    `CREATE TABLE IF NOT EXISTS roadmap_items (
       id INTEGER PRIMARY KEY,
       title TEXT NOT NULL,
       notes TEXT NOT NULL DEFAULT '',
       committed_at INTEGER,
       to_leadership INTEGER NOT NULL DEFAULT 1,
       created_at INTEGER NOT NULL
     )`,
    // Epics are linked by the tracker's own key, so links survive a re-sync.
    `CREATE TABLE IF NOT EXISTS epic_links (
       kind TEXT NOT NULL,
       owner_id INTEGER NOT NULL,
       source TEXT NOT NULL,
       external_id TEXT NOT NULL,
       baseline_total INTEGER NOT NULL DEFAULT 0,
       linked_at INTEGER NOT NULL,
       PRIMARY KEY (kind, owner_id, source, external_id)
     )`,
  ],
];

interface PersonRow {
  id: number;
  name: string;
  is_pm: number;
}

interface CaptureRow {
  id: number;
  created_at: number;
  kind: string;
  body: string;
  person_id: number | null;
  project_id: number | null;
  is_win: number;
  done_at: number | null;
  due_at: number | null;
}

/** Local storage for people, projects and quick captures. */
export class CaptureStore {
  /** Activity synced from other systems. */
  readonly items: ItemStore;
  /** The systems the app is connected to. */
  readonly connections: ConnectionStore;

  /** Tickets and epics synced from issue trackers. */
  readonly work: WorkStore;
  readonly settings: SettingsStore;
  /** The CPO's priorities and the roadmap given to leadership. */
  readonly leadership: LeadershipStore;

  private constructor(private readonly db: Db) {
    this.items = new ItemStore(db);
    this.work = new WorkStore(db);
    this.settings = new SettingsStore(db);
    this.leadership = new LeadershipStore(db);
    this.connections = new ConnectionStore(db, this.items, this.work);
  }

  /**
   * Opens the database, bringing its tables up to date first.
   *
   * The main window and the capture window both do this at launch. On a new install they can
   * run the same steps at the same moment and trip over each other, so a failed attempt is
   * retried: every step is safe to run twice, and by the retry the other window has finished.
   */
  static async open(db: Db, retryDelayMs = 150): Promise<CaptureStore> {
    const attempts = 5;
    for (let attempt = 1; ; attempt++) {
      try {
        await migrate(db);
        return new CaptureStore(db);
      } catch (cause) {
        if (attempt === attempts) throw cause;
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs * attempt));
      }
    }
  }

  // People

  async people(): Promise<Person[]> {
    const rows = await this.db.all<PersonRow>(
      "SELECT id, name, is_pm FROM people ORDER BY is_pm DESC, name COLLATE NOCASE",
    );
    return rows.map(toPerson);
  }

  /** Returns the existing person when the name is already taken (case-insensitive). */
  async addPerson(name: string, isPM = false): Promise<Person> {
    const trimmed = cleanName(name);
    const existing = await this.db.all<PersonRow>("SELECT id, name, is_pm FROM people WHERE name = ?", [trimmed]);
    if (existing.length > 0) return toPerson(existing[0]);
    const { lastInsertId } = await this.db.run("INSERT INTO people (name, is_pm) VALUES (?, ?)", [
      trimmed,
      isPM ? 1 : 0,
    ]);
    return { id: lastInsertId, name: trimmed, isPM };
  }

  async setPersonIsPM(id: number, isPM: boolean): Promise<void> {
    await this.db.run("UPDATE people SET is_pm = ? WHERE id = ?", [isPM ? 1 : 0, id]);
  }

  /** Their captures are kept, with no person attached. */
  async deletePerson(id: number): Promise<void> {
    // Done by hand as well as by the foreign key, which only acts when the connection enforces it.
    await this.db.run("UPDATE captures SET person_id = NULL WHERE person_id = ?", [id]);
    await this.db.run("DELETE FROM people WHERE id = ?", [id]);
  }

  // Projects

  async projects(): Promise<Project[]> {
    return this.db.all<Project>("SELECT id, name FROM projects ORDER BY name COLLATE NOCASE");
  }

  /** Returns the existing project when the name is already taken (case-insensitive). */
  async addProject(name: string): Promise<Project> {
    const trimmed = cleanName(name);
    const existing = await this.db.all<Project>("SELECT id, name FROM projects WHERE name = ?", [trimmed]);
    if (existing.length > 0) return existing[0];
    const { lastInsertId } = await this.db.run("INSERT INTO projects (name) VALUES (?)", [trimmed]);
    return { id: lastInsertId, name: trimmed };
  }

  /** Its captures are kept, with no project attached. */
  async deleteProject(id: number): Promise<void> {
    await this.db.run("UPDATE captures SET project_id = NULL WHERE project_id = ?", [id]);
    await this.db.run("DELETE FROM projects WHERE id = ?", [id]);
  }

  // Captures

  async addCapture(input: NewCapture): Promise<Capture> {
    const body = input.body.trim();
    if (!body) throw new Error("A capture needs some text.");
    const capture = {
      createdAt: input.at ?? Date.now(),
      kind: input.kind ?? "note",
      body,
      personId: input.personId ?? null,
      projectId: input.projectId ?? null,
      isWin: input.isWin ?? false,
      doneAt: null,
      dueAt: input.dueAt ?? null,
    };
    const { lastInsertId } = await this.db.run(
      "INSERT INTO captures (created_at, kind, body, person_id, project_id, is_win, due_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [
        capture.createdAt, capture.kind, capture.body, capture.personId, capture.projectId,
        capture.isWin ? 1 : 0, capture.dueAt,
      ],
    );
    return { id: lastInsertId, ...capture };
  }

  /** Changes a capture's text, kind, person, project or win tag. When it was captured and done stays as is. */
  async updateCapture(id: number, input: NewCapture): Promise<void> {
    const body = input.body.trim();
    if (!body) throw new Error("A capture needs some text.");
    await this.db.run(
      "UPDATE captures SET kind = ?, body = ?, person_id = ?, project_id = ?, is_win = ?, due_at = ? WHERE id = ?",
      [
        input.kind ?? "note", body, input.personId ?? null, input.projectId ?? null,
        input.isWin ? 1 : 0, input.dueAt ?? null, id,
      ],
    );
  }

  /** Newest first. */
  async captures(filter: CaptureFilter = {}): Promise<Capture[]> {
    const { clause, params } = whereClause(filter);
    const rows = await this.db.all<CaptureRow>(
      `SELECT id, created_at, kind, body, person_id, project_id, is_win, done_at, due_at
       FROM captures ${clause}
       ORDER BY created_at DESC, id DESC LIMIT ?`,
      [...params, filter.limit ?? 500],
    );
    return rows.flatMap(toCapture);
  }

  /** Open commitments and asks of David: the menu bar number until the decision queue exists. */
  async waitingOnMeCount(): Promise<number> {
    const { clause, params } = whereClause({ waitingOnMeOnly: true });
    const rows = await this.db.all<{ n: number }>(`SELECT COUNT(*) AS n FROM captures ${clause}`, params);
    return rows[0]?.n ?? 0;
  }

  async setCaptureDone(id: number, done: boolean, at: number = Date.now()): Promise<void> {
    await this.db.run("UPDATE captures SET done_at = ? WHERE id = ?", [done ? at : null, id]);
  }

  async setCaptureWin(id: number, isWin: boolean): Promise<void> {
    await this.db.run("UPDATE captures SET is_win = ? WHERE id = ?", [isWin ? 1 : 0, id]);
  }

  async deleteCapture(id: number): Promise<void> {
    await this.db.run("DELETE FROM captures WHERE id = ?", [id]);
  }
}

async function migrate(db: Db): Promise<void> {
  const rows = await db.all<{ user_version: number }>("PRAGMA user_version");
  const version = rows[0]?.user_version ?? 0;
  for (let next = version; next < MIGRATIONS.length; next++) {
    for (const step of MIGRATIONS[next]) {
      if (typeof step === "string") await db.run(step);
      else await step(db);
    }
    await db.run(`PRAGMA user_version = ${next + 1}`);
  }
}

function whereClause(filter: CaptureFilter): { clause: string; params: SqlParam[] } {
  const conditions: string[] = [];
  const params: SqlParam[] = [];

  if (filter.personId != null) {
    conditions.push("person_id = ?");
    params.push(filter.personId);
  }
  if (filter.projectId != null) {
    conditions.push("project_id = ?");
    params.push(filter.projectId);
  }
  if (filter.winsOnly) conditions.push("is_win = 1");
  if (filter.openOnly || filter.waitingOnMeOnly) {
    const kinds = CAPTURE_KINDS.filter(filter.waitingOnMeOnly ? waitsOnMe : isActionable);
    conditions.push(`done_at IS NULL AND kind IN (${kinds.map(() => "?").join(", ")})`);
    params.push(...kinds);
  }
  const search = filter.search?.trim();
  if (search) {
    conditions.push("body LIKE ? ESCAPE '\\'");
    params.push(`%${search.replace(/[\\%_]/g, "\\$&")}%`);
  }

  return { clause: conditions.length ? `WHERE ${conditions.join(" AND ")}` : "", params };
}

function cleanName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("A name can't be empty.");
  return trimmed;
}

function toPerson(row: PersonRow): Person {
  return { id: row.id, name: row.name, isPM: row.is_pm === 1 };
}

function toCapture(row: CaptureRow): Capture[] {
  if (!(CAPTURE_KINDS as readonly string[]).includes(row.kind)) return [];
  return [
    {
      id: row.id,
      createdAt: row.created_at,
      kind: row.kind as CaptureKind,
      body: row.body,
      personId: row.person_id,
      projectId: row.project_id,
      isWin: row.is_win === 1,
      doneAt: row.done_at,
      dueAt: row.due_at,
    },
  ];
}
