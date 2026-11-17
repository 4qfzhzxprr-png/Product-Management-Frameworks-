import { Alert, Button, Input, Popconfirm, Switch, Tag } from "antd";
import { FileUp, Plug, RefreshCw, Trash2 } from "lucide-react";
import { useState } from "react";
import type { Connection, Connector, SyncReport } from "../core/connectors";
import type { CaptureStore } from "../core/store";
import { platformSecrets } from "../platform";
import { GlassCard } from "./components";
import { readSettings, TicketImport } from "./TicketImport";
import { registry, SYNC_EVERY_MINUTES } from "./useSync";
import { message } from "./useStore";

function when(time: number, now: number): string {
  const minutes = Math.max(0, Math.round((now - time) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return hours === 1 ? "1 hour ago" : `${hours} hours ago`;
  return new Date(time).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

/** The fields a connector asks for, filled in to create a connection. */
function ConnectForm({
  connector,
  onCancel,
  onSave,
}: {
  connector: Connector;
  onCancel: () => void;
  onSave: (name: string, config: Record<string, string>, secrets: Record<string, string>) => Promise<void>;
}) {
  const [name, setName] = useState(connector.name);
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const missing = connector.fields.filter((field) => field.required && !values[field.key]?.trim());

  return (
    <form
      className="connect-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (!name.trim() || missing.length > 0) return;
        const config: Record<string, string> = {};
        const secrets: Record<string, string> = {};
        for (const field of connector.fields) {
          const value = values[field.key]?.trim() ?? "";
          if (field.secret) secrets[field.key] = value;
          else config[field.key] = value;
        }
        setSaving(true);
        onSave(name, config, secrets).then(
          () => setSaving(false),
          (cause) => {
            setSaving(false);
            setError(message(cause));
          },
        );
      }}
    >
      <h2>Connect: {connector.name}</h2>
      <p className="muted small">{connector.description}</p>
      <label className="field">
        Name in the app
        <Input value={name} onChange={(event) => setName(event.target.value)} />
        <span className="muted small">Shown next to everything this connection brings in.</span>
      </label>
      {connector.fields.map((field) => {
        const Field = field.secret ? Input.Password : Input;
        return (
          <label key={field.key} className="field">
            {field.label}
            {field.required ? "" : " (optional)"}
            <Field
              aria-label={field.label}
              placeholder={field.placeholder}
              value={values[field.key] ?? ""}
              autoComplete="off"
              onChange={(event) => setValues({ ...values, [field.key]: event.target.value })}
            />
            {field.help && <span className="muted small">{field.help}</span>}
            {field.secret && <span className="muted small">Kept in the Mac Keychain, never in the app's files.</span>}
          </label>
        );
      })}
      {error && <p className="error">{error}</p>}
      <div className="note-actions">
        <Button onClick={onCancel}>Cancel</Button>
        <Button htmlType="submit" type="primary" loading={saving} disabled={!name.trim() || missing.length > 0}>
          Connect and sync
        </Button>
      </div>
    </form>
  );
}

/** Every connected system: add, pause, sync now, and remove. */
export function ConnectionsPage({
  store,
  connections,
  now,
  syncing,
  lastRun,
  reports,
  syncNow,
  change,
}: {
  store: CaptureStore;
  connections: Connection[];
  now: number;
  syncing: boolean;
  lastRun: number | null;
  reports: SyncReport[];
  syncNow: () => Promise<void>;
  change: (work: () => Promise<unknown>) => Promise<void>;
}) {
  const [adding, setAdding] = useState<Connector | null>(null);
  // A file import in progress: "new", or the import connection being refreshed.
  const [importing, setImporting] = useState<Connection | "new" | null>(null);
  const syncable = connections.filter((connection) => !registry.get(connection.connectorId)?.manual);
  const [error, setError] = useState<string | null>(null);
  const secrets = platformSecrets();

  const received = (connection: Connection) =>
    reports.find((report) => report.connection.id === connection.id)?.received ?? null;

  return (
    <div className="page">
      <header className="page-head with-controls">
        <div>
          <h1>Connections</h1>
          <p>
            The systems this app reads from. Everything stays on this Mac, and nothing is ever written back. Syncs when
            the app opens and every {SYNC_EVERY_MINUTES} minutes.
          </p>
        </div>
        <Button
          icon={<RefreshCw size={15} aria-hidden="true" />}
          loading={syncing}
          disabled={syncable.length === 0}
          onClick={() => void syncNow()}
        >
          Sync now
        </Button>
      </header>

      <Alert
        type="info"
        showIcon
        title="Check with IT or security before connecting company systems"
        description="Company email, calendars and documents will be copied onto this Mac. The plan calls for clearance before real company data flows through the app."
      />
      {error && <Alert type="error" showIcon title={error} closable onClose={() => setError(null)} />}

      {connections.length > 0 && (
        <div className="team-grid">
          {connections.map((connection, index) => {
            const connector = registry.get(connection.connectorId);
            const count = received(connection);
            const imported = connector?.manual ? readSettings(connection) : null;
            return (
              <GlassCard key={connection.id} className="pm-card" index={index} aria-label={connection.name}>
                <header className="roadmap-head">
                  <span className="avatar" aria-hidden="true">
                    <Plug size={18} />
                  </span>
                  <div>
                    <h2>{connection.name}</h2>
                    <p className="muted small">{connector?.name ?? `Unknown connector "${connection.connectorId}"`}</p>
                  </div>
                  {!connector?.manual && (
                  <Switch
                    checked={connection.enabled}
                    aria-label={connection.enabled ? `Pause ${connection.name}` : `Resume ${connection.name}`}
                    onChange={(enabled) => void change(() => store.connections.setEnabled(connection.id, enabled))}
                  />
                  )}
                </header>
                <p className="small">
                  {imported
                    ? `Imported ${imported.fileName}: ${imported.count} tickets and epics, ${when(imported.importedAt, now)}.`
                    : !connection.enabled
                    ? "Paused. It keeps what it brought in but does not sync."
                    : connection.lastSyncAt === null
                      ? "Not synced yet."
                      : connection.lastError
                        ? `Last tried ${when(connection.lastSyncAt, now)}.`
                        : `Synced ${when(connection.lastSyncAt, now)}${count !== null ? `: ${count} ${count === 1 ? "item" : "items"}` : ""}.`}
                </p>
                {connection.enabled && connection.lastError && (
                  <Alert type="error" showIcon title="Last sync failed" description={connection.lastError} />
                )}
                <div className="pm-actions">
                  {connector?.manual && (
                    <Button
                      size="small"
                      type="primary"
                      icon={<FileUp size={14} aria-hidden="true" />}
                      onClick={() => {
                        setAdding(null);
                        setImporting(connection);
                      }}
                    >
                      Import a newer file
                    </Button>
                  )}
                  <Popconfirm
                    title={`Remove ${connection.name}?`}
                    description="Everything it brought in is deleted from this Mac, and its secrets leave the Keychain."
                    okText="Remove"
                    okButtonProps={{ danger: true }}
                    onConfirm={() =>
                      void change(async () => {
                        await store.connections.remove(connection.id);
                        await secrets.delete(connection.id);
                      }).catch((cause) => setError(message(cause)))
                    }
                  >
                    <Button size="small" danger icon={<Trash2 size={14} aria-hidden="true" />}>
                      Remove
                    </Button>
                  </Popconfirm>
                </div>
              </GlassCard>
            );
          })}
        </div>
      )}

      {importing ? (
        <GlassCard>
          <TicketImport
            store={store}
            existing={importing === "new" ? null : importing}
            now={now}
            onCancel={() => setImporting(null)}
            onDone={async () => {
              setImporting(null);
              await change(async () => {});
            }}
          />
        </GlassCard>
      ) : adding ? (
        <GlassCard>
          <ConnectForm
            connector={adding}
            onCancel={() => setAdding(null)}
            onSave={async (name, config, secretValues) => {
              let id: number | null = null;
              try {
                const connection = await store.connections.add(adding.id, name, config);
                id = connection.id;
                await secrets.set(connection.id, secretValues);
              } catch (cause) {
                // Do not leave a connection behind whose secrets could not be stored.
                if (id !== null) await store.connections.remove(id);
                throw cause;
              }
              setAdding(null);
              await change(async () => {});
              await syncNow();
            }}
          />
        </GlassCard>
      ) : (
        <GlassCard aria-labelledby="add-connection">
          <h2 id="add-connection">Add a connection</h2>
          <p className="muted small">
            More kinds of system are added one small adapter at a time. Tell Claude which system you want next.
          </p>
          <ul className="connector-list">
            {registry.all().map((connector) => (
              <li key={connector.id}>
                <div>
                  <p className="alert-title">{connector.name}</p>
                  <p className="muted small">{connector.description}</p>
                </div>
                <Button type="primary" onClick={() => (connector.manual ? setImporting("new") : setAdding(connector))}>
                  {connector.manual ? "Import" : "Connect"}
                </Button>
              </li>
            ))}
          </ul>
        </GlassCard>
      )}

      {lastRun !== null && (
        <p className="muted small">
          Last sync run {when(lastRun, now)}. <Tag variant="filled">{syncable.filter((entry) => entry.enabled).length} syncing</Tag>
        </p>
      )}
    </div>
  );
}
