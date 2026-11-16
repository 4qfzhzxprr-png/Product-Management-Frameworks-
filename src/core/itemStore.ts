import type { Db } from "./db";
import { BUCKETS, classify, type Bucket, type IncomingItem, type ItemSource, type ItemType, type SourceItem } from "./items";

interface ItemRow {
  id: number;
  source: string;
  external_id: string;
  type: string;
  title: string;
  snippet: string;
  author: string;
  url: string;
  occurred_at: number;
  addressed_to_me: number;
  from_me: number;
  bucket: string;
  bucket_override: string | null;
  dismissed_at: number | null;
}

/** Local storage for activity synced from company systems. The table is created by CaptureStore.open. */
export class ItemStore {
  constructor(private readonly db: Db) {}

  /**
   * Adds an item, or updates the one already stored for the same thread, page or ticket.
   * A bucket David chose is kept. Newer activity brings a dismissed item back.
   */
  async upsert(item: IncomingItem): Promise<void> {
    await this.db.run(
      `INSERT INTO items
         (source, external_id, type, title, snippet, author, url, occurred_at, addressed_to_me, from_me, bucket)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(source, external_id) DO UPDATE SET
         dismissed_at = CASE WHEN excluded.occurred_at > items.occurred_at THEN NULL ELSE items.dismissed_at END,
         type = excluded.type,
         title = excluded.title,
         snippet = excluded.snippet,
         author = excluded.author,
         url = excluded.url,
         occurred_at = excluded.occurred_at,
         addressed_to_me = excluded.addressed_to_me,
         from_me = excluded.from_me,
         bucket = excluded.bucket`,
      [
        item.source,
        item.externalId,
        item.type,
        item.title,
        item.snippet,
        item.author,
        item.url,
        item.occurredAt,
        item.addressedToMe ? 1 : 0,
        item.fromMe ? 1 : 0,
        classify(item),
      ],
    );
  }

  /** Newest first. Dismissed items are left out unless asked for. */
  async list(options: { includeDismissed?: boolean; limit?: number } = {}): Promise<SourceItem[]> {
    const rows = await this.db.all<ItemRow>(
      `SELECT * FROM items ${options.includeDismissed ? "" : "WHERE dismissed_at IS NULL"}
       ORDER BY occurred_at DESC, id DESC LIMIT ?`,
      [options.limit ?? 2000],
    );
    return rows.map(toItem);
  }

  /** Open items the rules or David put in "needs my decision". */
  async decisionCount(): Promise<number> {
    const rows = await this.db.all<{ n: number }>(
      "SELECT COUNT(*) AS n FROM items WHERE dismissed_at IS NULL AND COALESCE(bucket_override, bucket) = 'decision'",
    );
    return rows[0]?.n ?? 0;
  }

  /** Moves an item to a bucket David chose. It stays there through later syncs. */
  async move(id: number, bucket: Bucket): Promise<void> {
    await this.db.run("UPDATE items SET bucket_override = ? WHERE id = ?", [bucket, id]);
  }

  async dismiss(id: number, at: number = Date.now()): Promise<void> {
    await this.db.run("UPDATE items SET dismissed_at = ? WHERE id = ?", [at, id]);
  }

  async restore(id: number): Promise<void> {
    await this.db.run("UPDATE items SET dismissed_at = NULL WHERE id = ?", [id]);
  }
}

function toBucket(value: string | null): Bucket | null {
  return (BUCKETS as readonly string[]).includes(value ?? "") ? (value as Bucket) : null;
}

function toItem(row: ItemRow): SourceItem {
  const override = toBucket(row.bucket_override);
  return {
    id: row.id,
    source: row.source as ItemSource,
    externalId: row.external_id,
    type: row.type as ItemType,
    title: row.title,
    snippet: row.snippet,
    author: row.author,
    url: row.url,
    occurredAt: row.occurred_at,
    addressedToMe: row.addressed_to_me === 1,
    fromMe: row.from_me === 1,
    bucket: override ?? toBucket(row.bucket) ?? "fyi",
    moved: override !== null,
    dismissedAt: row.dismissed_at,
  };
}
