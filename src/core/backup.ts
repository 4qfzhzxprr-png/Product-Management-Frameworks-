import type { Db } from "./db";

/** Backups of the whole database, and a plain export of everything in it. */

export const BACKUP_SETTINGS = "backup";

export interface BackupSettings {
  /** When the last backup was made, automatic or by hand. */
  lastBackupAt: number | null;
  /** How many backup files to keep. */
  keep: number;
}

export function completeBackupSettings(saved: Partial<BackupSettings> | null): BackupSettings {
  return { lastBackupAt: saved?.lastBackupAt ?? null, keep: saved?.keep ?? 14 };
}

/** One automatic backup a day: due when the last one is more than 20 hours old. */
export function isBackupDue(settings: BackupSettings, now: number): boolean {
  return settings.lastBackupAt === null || now - settings.lastBackupAt > 20 * 3_600_000;
}

/** A file name that sorts by date: "dailywork-2026-11-17-0930.db". */
export function backupName(now: number, extension = "db"): string {
  const date = new Date(now);
  const pad = (part: number) => String(part).padStart(2, "0");
  return `dailywork-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}.${extension}`;
}

/** Writes a consistent copy of the open database to a new file. */
export async function backupInto(db: Db, path: string): Promise<void> {
  await db.run("VACUUM INTO ?", [path]);
}

export interface Export {
  app: "Daily Work";
  exportedAt: string;
  /** The schema version, so an export can be read back later. */
  version: number;
  tables: Record<string, Record<string, unknown>[]>;
}

/** Every table and row, as plain JSON that any tool can read. */
export async function exportAll(db: Db, now = Date.now()): Promise<Export> {
  const tables = await db.all<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
  );
  const version = (await db.all<{ user_version: number }>("PRAGMA user_version"))[0]?.user_version ?? 0;
  const result: Export = { app: "Daily Work", exportedAt: new Date(now).toISOString(), version, tables: {} };
  for (const { name } of tables) {
    // Table names come from SQLite itself, not from input, so quoting them here is safe.
    result.tables[name] = await db.all<Record<string, unknown>>(`SELECT * FROM "${name.replace(/"/g, '""')}"`);
  }
  return result;
}
