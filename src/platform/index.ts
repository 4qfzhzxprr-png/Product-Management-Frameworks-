import type { AgentFile, AgentRunner } from "../core/agents";
import { MemorySecretStore, type HttpClient, type SecretStore } from "../core/connectors";
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

/** Opens a link in the default browser. Only web links are opened. */
export async function openExternal(url: string): Promise<void> {
  if (!/^https?:\/\//i.test(url)) return;
  if (isTauri) {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(url);
  } else {
    window.open(url, "_blank", "noopener");
  }
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

/**
 * Makes web requests for connectors. The Mac app sends them from the native side, which
 * avoids the browser's cross-site limits; the browser preview uses ordinary fetch.
 */
export function platformHttp(): HttpClient {
  return async (url, init = {}) => {
    const request = { method: init.method ?? "GET", headers: init.headers, body: init.body };
    const response = isTauri
      ? await (await import("@tauri-apps/plugin-http")).fetch(url, request)
      : await window.fetch(url, request);
    return { status: response.status, text: () => response.text() };
  };
}

let previewSecrets: SecretStore | null = null;

/** Where connection secrets live: the Mac Keychain, or memory in the browser preview. */
export function platformSecrets(): SecretStore {
  if (!isTauri) return (previewSecrets ??= new MemorySecretStore());
  const call = async <T>(command: string, args: Record<string, unknown>) =>
    (await import("@tauri-apps/api/core")).invoke<T>(command, args);
  return {
    async get(connectionId) {
      const value = await call<string | null>("secret_get", { connectionId });
      if (!value) return {};
      try {
        return JSON.parse(value) as Record<string, string>;
      } catch {
        return {};
      }
    },
    async set(connectionId, secrets) {
      await call("secret_set", { connectionId, value: JSON.stringify(secrets) });
    },
    async delete(connectionId) {
      await call("secret_delete", { connectionId });
    },
  };
}

/**
 * Runs David's agents. The Mac app starts Claude Code through the wrapper; the browser preview
 * reads invented sample agents and pretends to run them, so the page can be tried anywhere.
 */
export function platformAgentRunner(): AgentRunner {
  return isTauri ? tauriAgentRunner() : previewAgentRunner();
}

function tauriAgentRunner(): AgentRunner {
  const call = async <T>(command: string, args: Record<string, unknown>) =>
    (await import("@tauri-apps/api/core")).invoke<T>(command, args);
  return {
    async check(configuredPath) {
      try {
        return { ok: true, program: await call<string>("agent_find_claude", { configured: configuredPath }) };
      } catch (cause) {
        return { ok: false, reason: String(cause) };
      }
    },
    readFolder: (folder) => call<AgentFile[]>("agents_read_dir", { folder }),
    async start(request, onLine) {
      const { listen } = await import("@tauri-apps/api/event");
      let finish: (value: { code: number | null; stderr: string }) => void = () => {};
      const finished = new Promise<{ code: number | null; stderr: string }>((resolve) => (finish = resolve));
      const stopLines = await listen<{ runId: number; line: string }>("agent-line", (event) => {
        if (event.payload.runId === request.runId) onLine(event.payload.line);
      });
      const stopExit = await listen<{ runId: number; code: number | null; stderr: string }>("agent-exit", (event) => {
        if (event.payload.runId === request.runId) finish({ code: event.payload.code, stderr: event.payload.stderr });
      });
      try {
        await call("agent_start", { ...request });
        return await finished;
      } finally {
        stopLines();
        stopExit();
      }
    },
    async cancel(runId) {
      await call("agent_cancel", { runId });
    },
  };
}

function previewAgentRunner(): AgentRunner {
  const timers = new Map<number, { stop: () => void }>();
  const blank = new URLSearchParams(window.location.search).has("empty");
  return {
    async check() {
      return { ok: true, program: "claude (preview)" };
    },
    async readFolder() {
      if (blank) return [];
      const { SAMPLE_AGENT_FILES } = await import("./sampleAgents");
      return SAMPLE_AGENT_FILES;
    },
    async start(request, onLine) {
      const { sampleOutput, samplePurposeAnswer } = await import("./sampleAgents");
      const prompt = request.args[request.args.indexOf("--append-system-prompt") + 1] ?? "";
      const name = /acting as "([^"]+)"/.exec(prompt)?.[1] ?? "the agent";
      // A plain question names its purpose on the first line of its instructions.
      const purpose = /^Purpose: ([\w-]+)/.exec(prompt)?.[1] ?? null;
      const answer = purpose ? await samplePurposeAnswer(purpose, request.prompt) : sampleOutput(name, request.prompt);
      const lines = [
        { type: "system", subtype: "init", model: "preview", session_id: `preview-${request.runId}` },
        { type: "assistant", message: { content: [{ type: "text", text: "Reading the brief and what was attached." }] } },
        { type: "assistant", message: { content: [{ type: "tool_use", name: "Read", input: { file_path: "brief.md" } }] } },
        { type: "assistant", message: { content: [{ type: "text", text: "Drafting the answer." }] } },
        {
          type: "result",
          subtype: "success",
          result: answer,
          total_cost_usd: 0,
          duration_ms: 1200,
          session_id: `preview-${request.runId}`,
        },
      ];
      return new Promise((resolve) => {
        let index = 0;
        const timer = setInterval(() => {
          if (index < lines.length) onLine(JSON.stringify(lines[index++]));
          else {
            clearInterval(timer);
            timers.delete(request.runId);
            resolve({ code: 0, stderr: "" });
          }
        }, 300);
        timers.set(request.runId, {
          stop: () => {
            clearInterval(timer);
            timers.delete(request.runId);
            resolve({ code: null, stderr: "" });
          },
        });
      });
    },
    async cancel(runId) {
      timers.get(runId)?.stop();
    },
  };
}

export interface BackupFile {
  name: string;
  path: string;
  size: number;
  modifiedMs: number;
}

/** Backup files in ~/Documents/Daily Work Backups. The browser preview has none: it saves nothing. */
export const platformBackups = {
  available: isTauri,
  async folder(): Promise<string> {
    return (await import("@tauri-apps/api/core")).invoke<string>("backups_folder");
  },
  async list(): Promise<BackupFile[]> {
    if (!isTauri) return [];
    return (await import("@tauri-apps/api/core")).invoke<BackupFile[]>("backups_list");
  },
  async newPath(name: string): Promise<string> {
    return (await import("@tauri-apps/api/core")).invoke<string>("backups_new_path", { name });
  },
  async prune(keep: number): Promise<number> {
    return (await import("@tauri-apps/api/core")).invoke<number>("backups_prune", { keep });
  },
  /** Saves text: into the backup folder in the app, as a download in the browser. Returns where it went. */
  async saveText(name: string, text: string): Promise<string> {
    if (isTauri) return (await import("@tauri-apps/api/core")).invoke<string>("backups_write_text", { name, text });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([text], { type: "application/json" }));
    link.download = name;
    link.click();
    URL.revokeObjectURL(link.href);
    return `your Downloads folder as ${name}`;
  },
  /** Restarts the app with the chosen backup in place of the current data. */
  async restore(name: string): Promise<void> {
    await (await import("@tauri-apps/api/core")).invoke("backups_restore", { name });
  },
};

/** Writes the read-only copy of the app's data that agent runs may read; returns its folder. */
export async function writeAgentSnapshot(files: { name: string; text: string }[]): Promise<string> {
  if (!isTauri) return "~/Library/Application Support/app.dailywork.desktop/agent-snapshot";
  return (await import("@tauri-apps/api/core")).invoke<string>("snapshot_write", { files });
}

/** Shows a Mac notification. Returns false where there are none (the browser preview), or when David turned them off. */
export async function notify(title: string, body: string): Promise<boolean> {
  if (!isTauri) return false;
  const { isPermissionGranted, requestPermission, sendNotification } = await import("@tauri-apps/plugin-notification");
  let granted = await isPermissionGranted();
  if (!granted) granted = (await requestPermission()) === "granted";
  if (!granted) return false;
  sendNotification({ title, body });
  return true;
}

/** Saves a document as a file: ~/Documents/Daily Work/Agent work in the app, a download in the browser. Returns where it went. */
export async function saveDocument(name: string, text: string): Promise<string> {
  if (isTauri) return (await import("@tauri-apps/api/core")).invoke<string>("documents_save", { name, text });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([text], { type: "text/markdown" }));
  link.download = name;
  link.click();
  URL.revokeObjectURL(link.href);
  return `your Downloads folder as ${name}`;
}
