import { Alert, Button, Empty, Popconfirm, Tag } from "antd";
import { Archive, Download, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { BACKUP_SETTINGS, backupInto, backupName, completeBackupSettings, exportAll, type BackupSettings } from "../core/backup";
import { PURPOSE_LABELS, type ClaudeLogEntry } from "../core/claude";
import type { CaptureStore } from "../core/store";
import { platformBackups, type BackupFile } from "../platform";
import { GlassCard } from "./components";
import { useToast } from "./Toast";
import { message } from "./useStore";

const when = (time: number) => new Date(time).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
const size = (bytes: number) => (bytes < 1_000_000 ? `${Math.max(1, Math.round(bytes / 1000))} KB` : `${(bytes / 1_000_000).toFixed(1)} MB`);

/** Makes a backup now and keeps only the newest ones. Used by the page and the daily backup. */
export async function makeBackup(store: CaptureStore, now = Date.now()): Promise<string> {
  const settings = completeBackupSettings(await store.settings.get<Partial<BackupSettings>>(BACKUP_SETTINGS));
  const path = await platformBackups.newPath(backupName(now));
  await backupInto(store.database, path);
  await store.settings.set(BACKUP_SETTINGS, { ...settings, lastBackupAt: now } satisfies BackupSettings);
  await platformBackups.prune(settings.keep);
  return path;
}

/** Backups, exports and the record of everything sent to Claude. */
export function SettingsPage({ store, revision }: { store: CaptureStore; revision: number }) {
  return (
    <div className="page">
      <header className="page-head">
        <h1>Settings</h1>
        <p>Backups of everything stored on this Mac, and a record of everything sent to Claude.</p>
      </header>
      <BackupsCard store={store} revision={revision} />
      <ClaudeLogCard store={store} revision={revision} />
    </div>
  );
}

function BackupsCard({ store, revision }: { store: CaptureStore; revision: number }) {
  const toast = useToast();
  const [files, setFiles] = useState<BackupFile[]>([]);
  const [folder, setFolder] = useState<string | null>(null);
  const [settings, setSettings] = useState<BackupSettings>(completeBackupSettings(null));
  const [busy, setBusy] = useState<"backup" | "export" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setSettings(completeBackupSettings(await store.settings.get<Partial<BackupSettings>>(BACKUP_SETTINGS)));
    if (platformBackups.available) {
      setFolder(await platformBackups.folder());
      setFiles(await platformBackups.list());
    }
  }, [store]);

  useEffect(() => {
    load().catch((cause) => setError(message(cause)));
  }, [load, revision]);

  const run = async (kind: "backup" | "export", work: () => Promise<string>) => {
    setBusy(kind);
    setError(null);
    try {
      const where = await work();
      toast({ text: kind === "backup" ? "Backed up" : `Exported to ${where}` });
      await load();
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusy(null);
    }
  };

  return (
    <GlassCard className="job-form" aria-labelledby="backups-title">
      <h2 id="backups-title">Backups</h2>
      <p className="muted small">
        {platformBackups.available
          ? `A copy of everything is made once a day when the app opens, and the newest ${settings.keep} are kept in ${folder ?? "Documents/Daily Work Backups"}.`
          : "The browser preview saves nothing, so there is nothing to back up. Export still shows what a full export holds."}
        {settings.lastBackupAt ? ` Last backup ${when(settings.lastBackupAt)}.` : ""}
      </p>
      {error && <Alert type="error" showIcon title={error} />}
      <div className="note-actions start">
        {platformBackups.available && (
          <Button type="primary" icon={<Archive size={14} aria-hidden="true" />} loading={busy === "backup"} onClick={() => void run("backup", () => makeBackup(store))}>
            Back up now
          </Button>
        )}
        <Button
          icon={<Download size={14} aria-hidden="true" />}
          loading={busy === "export"}
          onClick={() =>
            void run("export", async () =>
              platformBackups.saveText(backupName(Date.now(), "json").replace(/^dailywork/, "dailywork-export"), JSON.stringify(await exportAll(store.database), null, 2)),
            )
          }
        >
          Export everything
        </Button>
      </div>
      {platformBackups.available && (
        <div className="pm-section">
          <h3>
            Backup files {files.length > 0 && <span className="count">{files.length}</span>}
          </h3>
          {files.length === 0 ? (
            <p className="muted small">None yet.</p>
          ) : (
            <ul className="items backup-list">
              {files.map((file) => (
                <li key={file.name} className="item">
                  <div className="item-text">
                    <p className="alert-title">{when(file.modifiedMs)}</p>
                    <p className="muted small">
                      {file.name} · {size(file.size)}
                    </p>
                  </div>
                  <Popconfirm
                    title="Restore this backup?"
                    description="The app restarts with this copy in place of today's data. Today's data is kept beside it as dailywork-before-restore.db."
                    okText="Restore and restart"
                    okButtonProps={{ danger: true }}
                    onConfirm={() => void platformBackups.restore(file.name).catch((cause) => setError(message(cause)))}
                  >
                    <Button size="small" icon={<RotateCcw size={13} aria-hidden="true" />}>
                      Restore
                    </Button>
                  </Popconfirm>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </GlassCard>
  );
}

function ClaudeLogCard({ store, revision }: { store: CaptureStore; revision: number }) {
  const [entries, setEntries] = useState<ClaudeLogEntry[]>([]);
  const [monthCost, setMonthCost] = useState(0);
  const [open, setOpen] = useState<number | null>(null);

  const load = useCallback(async () => {
    const now = new Date();
    setEntries(await store.claudeLog.list());
    setMonthCost(await store.claudeLog.costSince(new Date(now.getFullYear(), now.getMonth(), 1).getTime()));
  }, [store]);

  useEffect(() => {
    void load();
  }, [load, revision]);

  return (
    <GlassCard className="job-form" aria-labelledby="claude-log-title">
      <div className="run-head">
        <div>
          <h2 id="claude-log-title">Sent to Claude</h2>
          <p className="muted small">
            Every prompt the app sent, exactly as sent, and what came back. Kept on this Mac only.
            {monthCost > 0 ? ` This month: $${monthCost.toFixed(2)}, as reported by Claude Code.` : ""}
          </p>
        </div>
        {entries.length > 0 && (
          <Popconfirm title="Clear the log?" description="Agent runs keep their own record." okText="Clear" okButtonProps={{ danger: true }} onConfirm={() => void store.claudeLog.clear().then(load)}>
            <Button size="small">Clear</Button>
          </Popconfirm>
        )}
      </div>
      {entries.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Nothing has been sent to Claude yet." />
      ) : (
        <ul className="run-list claude-log">
          {entries.map((entry) => (
            <li key={entry.id}>
              <button className={open === entry.id ? "run-row selected" : "run-row"} aria-expanded={open === entry.id} onClick={() => setOpen(open === entry.id ? null : entry.id)}>
                <span className="run-title">
                  {PURPOSE_LABELS[entry.purpose] ?? entry.purpose}
                  {entry.agentName ? `: ${entry.agentName}` : ""}
                </span>
                <span className="muted small">
                  {when(entry.at)} · {entry.prompt.length.toLocaleString()} characters sent
                  {entry.costUsd ? ` · $${entry.costUsd.toFixed(2)}` : ""}
                </span>
                <span className="log-tags">
                  {entry.warnings.length > 0 && (
                    <Tag variant="filled" className="run-state waiting">
                      Sent despite warning
                    </Tag>
                  )}
                  <Tag variant="filled" className={`run-state ${entry.status === "failed" ? "failed" : ""}`}>
                    {entry.status === "done" ? "Answered" : entry.status === "failed" ? "Failed" : "Sent"}
                  </Tag>
                </span>
              </button>
              {open === entry.id && (
                <div className="log-detail">
                  {entry.warnings.length > 0 && (
                    <p className="small">Flagged: {entry.warnings.map((warning) => `${warning.label} (${warning.sample})`).join(", ")}</p>
                  )}
                  <h3>Instructions</h3>
                  <div className="run-output small">{entry.system || "(none)"}</div>
                  <h3>Sent</h3>
                  <div className="run-output small">{entry.prompt}</div>
                  <h3>{entry.status === "failed" ? "Error" : "Answer"}</h3>
                  <div className="run-output small">{entry.response || "(none yet)"}</div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </GlassCard>
  );
}
