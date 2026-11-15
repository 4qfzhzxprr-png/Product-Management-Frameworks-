export type SqlParam = string | number | null;

/** The small slice of SQLite the app needs. Implemented per platform. */
export interface Db {
  /** Runs one statement that returns no rows. */
  run(sql: string, params?: SqlParam[]): Promise<{ lastInsertId: number }>;
  /** Runs one statement and returns its rows keyed by column name. */
  all<T>(sql: string, params?: SqlParam[]): Promise<T[]>;
}
