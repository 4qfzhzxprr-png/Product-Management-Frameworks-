import initSqlJs, { type SqlJsStatic } from "sql.js";
import type { Db, SqlParam } from "../core/db";

/**
 * An in-memory SQLite database. Used by the tests and by the browser preview,
 * where there is no native wrapper. Nothing is saved.
 */
export async function openMemoryDb(wasmUrl?: string): Promise<Db> {
  const SQL: SqlJsStatic = await initSqlJs(wasmUrl ? { locateFile: () => wasmUrl } : undefined);
  const database = new SQL.Database();
  database.run("PRAGMA foreign_keys = ON");

  return {
    async run(sql, params: SqlParam[] = []) {
      database.run(sql, params);
      const result = database.exec("SELECT last_insert_rowid() AS id");
      return { lastInsertId: Number(result[0].values[0][0]) };
    },
    async all<T>(sql: string, params: SqlParam[] = []) {
      const statement = database.prepare(sql);
      try {
        statement.bind(params);
        const rows: T[] = [];
        while (statement.step()) rows.push(statement.getAsObject() as T);
        return rows;
      } finally {
        statement.free();
      }
    },
  };
}
