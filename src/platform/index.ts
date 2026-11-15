import type { Db } from "../core/db";

/** True inside the native wrapper; false in a plain browser tab (preview). */
export const isTauri = "__TAURI_INTERNALS__" in window;

const DATA_CHANGED = "data-changed";
const CAPTURE_OPENED = "capture-opened";

export async function openDb(): Promise<Db> {
  if (isTauri) {
    const { default: Database } = await import("@tauri-apps/plugin-sql");
    // Stored in the app's own folder under ~/Library/Application Support.
    const database = await Database.load("sqlite:dailywork.db");
    return {
      async run(sql, params = []) {
        const result = await database.execute(sql, params);
        return { lastInsertId: result.lastInsertId ?? 0 };
      },
      all<T>(sql: string, params: unknown[] = []) {
        return database.select<T[]>(sql, params);
      },
    };
  }
  const [{ openMemoryDb }, { default: wasmUrl }] = await Promise.all([
    import("./sqljsDb"),
    import("sql.js/dist/sql-wasm.wasm?url"),
  ]);
  return openMemoryDb(wasmUrl);
}

/** Updates the number beside the menu bar icon. */
export async function setWaitingCount(count: number): Promise<void> {
  if (!isTauri) return;
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("set_waiting_count", { count });
}

/** Opens the floating capture window. Returns false in the browser preview, which has none. */
export async function showCaptureWindow(): Promise<boolean> {
  if (!isTauri) return false;
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("show_capture");
  return true;
}

export async function hideThisWindow(): Promise<void> {
  if (!isTauri) return;
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  await getCurrentWindow().hide();
}

/** Tells every window that stored data changed. */
export async function notifyDataChanged(): Promise<void> {
  if (!isTauri) return;
  const { emit } = await import("@tauri-apps/api/event");
  await emit(DATA_CHANGED);
}

export function onDataChanged(callback: () => void): () => void {
  return subscribe(DATA_CHANGED, callback);
}

/** Fires each time the capture window is shown. */
export function onCaptureOpened(callback: () => void): () => void {
  return subscribe(CAPTURE_OPENED, callback);
}

function subscribe(event: string, callback: () => void): () => void {
  if (!isTauri) return () => {};
  let cancelled = false;
  let unlisten: (() => void) | undefined;
  void import("@tauri-apps/api/event").then(async ({ listen }) => {
    const stop = await listen(event, callback);
    if (cancelled) stop();
    else unlisten = stop;
  });
  return () => {
    cancelled = true;
    unlisten?.();
  };
}
