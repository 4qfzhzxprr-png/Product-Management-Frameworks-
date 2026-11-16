import type { Db } from "./db";
import type { ItemStore } from "./itemStore";
import type { Activity } from "./items";

/**
 * How the app connects to other systems.
 *
 * A connector is a small adapter for one kind of system (a mail provider, an issue tracker,
 * a wiki, anything with an API). It knows how to read that system and report what it finds
 * as plain `Activity` records. It knows nothing about the app's pages, and the pages know
 * nothing about it. Adding a system means writing one connector and registering it; the
 * brief, the queue and the menu bar count pick its activity up with no other change.
 *
 * A connection is one configured use of a connector: "Work email" using the mail connector,
 * say. There can be several connections per connector.
 */
export interface Connector {
  /** Stable id, such as "imap" or "jira-cloud". */
  id: string;
  /** What to call it on screen. */
  name: string;
  description: string;
  /** What the user fills in to connect. */
  fields: ConfigField[];
  /** Reads the system. Must not write to it. */
  sync(context: SyncContext): Promise<SyncResult>;
}

export interface ConfigField {
  key: string;
  label: string;
  help?: string;
  placeholder?: string;
  required?: boolean;
  /** Tokens and passwords. Kept in the Keychain, never in the database. */
  secret?: boolean;
}

export interface SyncContext {
  /** The non-secret fields the user filled in. */
  config: Record<string, string>;
  /** The secret fields, read from the Keychain for this sync only. */
  secrets: Record<string, string>;
  /** Whatever the connector returned as `cursor` last time, or null on the first sync. */
  cursor: string | null;
  now: number;
  /** Makes web requests. Supplied by the platform so connectors work in the app and in tests. */
  http: HttpClient;
}

export interface SyncResult {
  activities: Activity[];
  /** Where to resume next time: a timestamp, a page token, anything. Omit to keep the old one. */
  cursor?: string | null;
}

export type HttpClient = (
  url: string,
  init?: { method?: "GET" | "POST"; headers?: Record<string, string>; body?: string },
) => Promise<{ status: number; text(): Promise<string> }>;

/** Where secret fields live. The Mac app backs this with the Keychain. */
export interface SecretStore {
  get(connectionId: number): Promise<Record<string, string>>;
  set(connectionId: number, secrets: Record<string, string>): Promise<void>;
  delete(connectionId: number): Promise<void>;
}

/** Keeps secrets in memory. For tests and the browser preview. */
export class MemorySecretStore implements SecretStore {
  private readonly secrets = new Map<number, Record<string, string>>();

  async get(connectionId: number) {
    return this.secrets.get(connectionId) ?? {};
  }

  async set(connectionId: number, secrets: Record<string, string>) {
    this.secrets.set(connectionId, secrets);
  }

  async delete(connectionId: number) {
    this.secrets.delete(connectionId);
  }
}

/** The connectors the app knows about. */
export class ConnectorRegistry {
  private readonly connectors = new Map<string, Connector>();

  register(connector: Connector): this {
    if (this.connectors.has(connector.id)) throw new Error(`A connector called "${connector.id}" is already registered.`);
    this.connectors.set(connector.id, connector);
    return this;
  }

  get(id: string): Connector | undefined {
    return this.connectors.get(id);
  }

  all(): Connector[] {
    return [...this.connectors.values()];
  }
}

export interface Connection {
  id: number;
  connectorId: string;
  name: string;
  config: Record<string, string>;
  enabled: boolean;
  cursor: string | null;
  lastSyncAt: number | null;
  /** Why the last sync failed, or null if it worked. */
  lastError: string | null;
}

interface ConnectionRow {
  id: number;
  connector_id: string;
  name: string;
  config: string;
  enabled: number;
  cursor: string | null;
  last_sync_at: number | null;
  last_error: string | null;
}

/** The value stored as `source` on everything a connection brings in. */
export function sourceOf(connectionId: number): string {
  return `connection-${connectionId}`;
}

/** Local storage for connections. The table is created by CaptureStore.open. */
export class ConnectionStore {
  constructor(
    private readonly db: Db,
    private readonly items: ItemStore,
  ) {}

  async list(): Promise<Connection[]> {
    const rows = await this.db.all<ConnectionRow>("SELECT * FROM connections ORDER BY name COLLATE NOCASE, id");
    return rows.map(toConnection);
  }

  async add(connectorId: string, name: string, config: Record<string, string> = {}): Promise<Connection> {
    const trimmed = name.trim();
    if (!trimmed) throw new Error("A connection needs a name.");
    const { lastInsertId } = await this.db.run(
      "INSERT INTO connections (connector_id, name, config) VALUES (?, ?, ?)",
      [connectorId, trimmed, JSON.stringify(config)],
    );
    return {
      id: lastInsertId, connectorId, name: trimmed, config,
      enabled: true, cursor: null, lastSyncAt: null, lastError: null,
    };
  }

  async setEnabled(id: number, enabled: boolean): Promise<void> {
    await this.db.run("UPDATE connections SET enabled = ? WHERE id = ?", [enabled ? 1 : 0, id]);
  }

  /** Records how a sync went. A failed sync keeps the old cursor, so nothing is skipped. */
  async recordSync(id: number, at: number, outcome: { cursor?: string | null } | { error: string }): Promise<void> {
    if ("error" in outcome) {
      await this.db.run("UPDATE connections SET last_sync_at = ?, last_error = ? WHERE id = ?", [at, outcome.error, id]);
    } else if (outcome.cursor !== undefined) {
      await this.db.run("UPDATE connections SET last_sync_at = ?, last_error = NULL, cursor = ? WHERE id = ?", [
        at,
        outcome.cursor,
        id,
      ]);
    } else {
      await this.db.run("UPDATE connections SET last_sync_at = ?, last_error = NULL WHERE id = ?", [at, id]);
    }
  }

  /** Disconnects, and removes everything the connection brought in. */
  async remove(id: number): Promise<void> {
    await this.items.deleteSource(sourceOf(id));
    await this.db.run("DELETE FROM connections WHERE id = ?", [id]);
  }
}

function toConnection(row: ConnectionRow): Connection {
  let config: Record<string, string> = {};
  try {
    config = JSON.parse(row.config) as Record<string, string>;
  } catch {
    // An unreadable config is treated as empty; the connector will report what is missing.
  }
  return {
    id: row.id,
    connectorId: row.connector_id,
    name: row.name,
    config,
    enabled: row.enabled === 1,
    cursor: row.cursor,
    lastSyncAt: row.last_sync_at,
    lastError: row.last_error,
  };
}

export interface SyncReport {
  connection: Connection;
  /** How many activities came back, or null if the sync failed. */
  received: number | null;
  error: string | null;
}

/**
 * Syncs every enabled connection. Each runs on its own: one that fails is recorded
 * with its error and does not stop the others.
 */
export async function syncAll(deps: {
  registry: ConnectorRegistry;
  connections: ConnectionStore;
  items: ItemStore;
  secrets: SecretStore;
  http: HttpClient;
  now?: () => number;
}): Promise<SyncReport[]> {
  const now = deps.now ?? Date.now;
  const enabled = (await deps.connections.list()).filter((connection) => connection.enabled);

  return Promise.all(
    enabled.map(async (connection): Promise<SyncReport> => {
      try {
        const connector = deps.registry.get(connection.connectorId);
        if (!connector) throw new Error(`No connector called "${connection.connectorId}" is installed.`);

        const secrets = await deps.secrets.get(connection.id);
        const missing = connector.fields.filter(
          (field) => field.required && !(field.secret ? secrets : connection.config)[field.key],
        );
        if (missing.length > 0) throw new Error(`Missing: ${missing.map((field) => field.label).join(", ")}.`);

        const result = await connector.sync({
          config: connection.config,
          secrets,
          cursor: connection.cursor,
          now: now(),
          http: deps.http,
        });
        for (const activity of result.activities) {
          await deps.items.upsert({ ...activity, source: sourceOf(connection.id), sourceName: connection.name });
        }
        await deps.connections.recordSync(connection.id, now(), { cursor: result.cursor });
        return { connection, received: result.activities.length, error: null };
      } catch (cause) {
        const error = cause instanceof Error ? cause.message : String(cause);
        await deps.connections.recordSync(connection.id, now(), { error });
        return { connection, received: null, error };
      }
    }),
  );
}
