import { Alert, Button, Empty, Popconfirm, Switch, Tag } from "antd";
import { Archive, Download, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { BACKUP_SETTINGS, backupInto, backupName, completeBackupSettings, exportAll, type BackupSettings } from "../core/backup";
import { PURPOSE_LABELS, type ClaudeLogEntry } from "../core/claude";
import type { CaptureStore } from "../core/store";
import { notify, platformBackups, type BackupFile } from "../platform";
import { completeReminderSettings, REMINDER_SETTINGS, type ReminderSettings } from "../core/reminders";
import { REMINDER_HISTORY, type ShownReminder } from "./useReminders";
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
        <p>Reminders, backups of everything stored on this Mac, and a record of everything sent to Claude.</p>
      </header>
      <RemindersCard store={store} revision={revision} />
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

function RemindersCard({ store, revision }: { store: CaptureStore; revision: number }) {
  const toast = useToast();
  const [settings, setSettings] = useState<ReminderSettings>(completeReminderSettings(null));
  const [history, setHistory] = useState<ShownReminder[]>([]);

  useEffect(() => {
    let stale = false;
    void Promise.all([
      store.settings.get<Partial<ReminderSettings>>(REMINDER_SETTINGS),
      store.settings.get<ShownReminder[]>(REMINDER_HISTORY),
    ]).then(([saved, shown]) => {
      if (stale) return;
      setSettings(completeReminderSettings(saved));
      setHistory(shown ?? []);
    });
    return () => {
      stale = true;
    };
  }, [store, revision]);

  const save = (next: ReminderSettings) => {
    setSettings(next);
    store.settings.set(REMINDER_SETTINGS, next).catch((cause) => toast({ text: message(cause) }));
  };

  const timeField = (label: string, value: string, onChange: (value: string) => void) => (
    <input type="time" className="ant-input time-input" aria-label={label} value={value} disabled={!settings.enabled} onChange={(event) => onChange(event.target.value)} />
  );

  return (
    <GlassCard className="job-form" aria-labelledby="reminders-title">
      <div className="run-head">
        <div>
          <h2 id="reminders-title">Reminders</h2>
          <p className="muted small">Mac notifications while the app is open. Each one comes once.</p>
        </div>
        <Switch checked={settings.enabled} aria-label="Reminders on" onChange={(enabled) => save({ ...settings, enabled })} />
      </div>
      <ul className="reminder-settings">
        <li>
          <Switch size="small" disabled={!settings.enabled} checked={settings.morning !== ""} aria-label="Morning summary" onChange={(on) => save({ ...settings, morning: on ? "08:30" : "" })} />
          <span>Morning summary on weekdays at</span>
          {timeField("Morning summary time", settings.morning || "08:30", (morning) => save({ ...settings, morning }))}
        </li>
        <li>
          <Switch size="small" disabled={!settings.enabled} checked={settings.slipping} aria-label="When a promise slips" onChange={(slipping) => save({ ...settings, slipping })} />
          <span>When a promise slips past its date</span>
        </li>
        <li>
          <Switch size="small" disabled={!settings.enabled} checked={settings.handoffLead > 0} aria-label="Before the handoff window closes" onChange={(on) => save({ ...settings, handoffLead: on ? 30 : 0 })} />
          <span>30 minutes before the shared hours with the offshore team end</span>
        </li>
        <li>
          <Switch size="small" disabled={!settings.enabled} checked={settings.agents} aria-label="When agent work is ready" onChange={(agents) => save({ ...settings, agents })} />
          <span>When an agent's work is ready for review</span>
        </li>
        <li>
          <Switch size="small" disabled={!settings.enabled} checked={settings.weekly !== ""} aria-label="Weekly review" onChange={(on) => save({ ...settings, weekly: on ? "16:00" : "" })} />
          <span>Weekly review on Fridays at</span>
          {timeField("Weekly review time", settings.weekly || "16:00", (weekly) => save({ ...settings, weekly }))}
        </li>
      </ul>
      <div className="note-actions start">
        <Button
          onClick={() =>
            void notify("Daily Work", "Notifications are working.").then((shown) =>
              toast({ text: shown ? "Sent a test notification" : platformBackups.available ? "Notifications are off for Daily Work in System Settings" : "The browser preview cannot show notifications" }),
            )
          }
        >
          Send a test notification
        </Button>
      </div>
      <div className="pm-section">
        <h3>Recent reminders</h3>
        {history.length === 0 ? (
          <p className="muted small">None yet.</p>
        ) : (
          <ul className="review-list reminder-history">
            {history.slice(0, 10).map((entry, index) => (
              <li key={index}>
                <strong>{entry.title}</strong> {entry.body}
                <span className="muted small"> · {when(entry.at)}{entry.notified ? "" : " · not shown as a notification"}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </GlassCard>
  );
}
