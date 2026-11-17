import { Alert, Button, Input, Select, Table, Tag } from "antd";
import { FileUp } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import type { Connection } from "../core/connectors";
import {
  buildRecords,
  detectColumns,
  FIELD_LABELS,
  FIELDS,
  parseCsv,
  REQUIRED,
  type ColumnMap,
  type Field,
  type ImportSettings,
} from "../core/connectors/ticketFile";
import type { CaptureStore } from "../core/store";
import { sourceOf } from "../core/connectors";
import { message } from "./useStore";

const STATUS_LABELS = { todo: "Not started", in_progress: "In progress", blocked: "Blocked", done: "Done" } as const;

/** Why a missing column matters, so David can decide whether to map it. */
const MISSING_EFFECT: Partial<Record<Field, string>> = {
  owner: "epics cannot be matched to PMs",
  team: "delivery cannot be split by team",
  parent: "tickets cannot be grouped under epics",
  sprint: "sprint progress cannot be shown",
  updated: "stale tickets cannot be spotted",
  resolved: "the shipped log uses the last update as the finish date",
};

export function readSettings(connection: Connection): ImportSettings | null {
  try {
    return connection.config.settings ? (JSON.parse(connection.config.settings) as ImportSettings) : null;
  } catch {
    return null;
  }
}

/** Choose a CSV export, check the columns, preview, and import. Re-importing replaces the old tickets. */
export function TicketImport({
  store,
  existing,
  now,
  onCancel,
  onDone,
}: {
  store: CaptureStore;
  /** The import connection to refresh, or null to create a new one. */
  existing: Connection | null;
  now: number;
  onCancel: () => void;
  onDone: () => Promise<void>;
}) {
  const saved = existing ? readSettings(existing) : null;
  const fileInput = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<string[][] | null>(null);
  const [columns, setColumns] = useState<ColumnMap | null>(null);
  const [linkPattern, setLinkPattern] = useState(saved?.linkPattern ?? "");
  const [name, setName] = useState(existing?.name ?? "");
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  async function readFile(file: File) {
    setError(null);
    try {
      const parsed = parseCsv(await file.text());
      if (parsed.length < 2) throw new Error("That file has no rows under its header. Export it again as CSV.");
      const detected = detectColumns(parsed[0]);
      // Reuse the last import's choices when the new file has the same columns.
      const reuse =
        saved && Object.values(saved.columns).every((index) => index < parsed[0].length) ? saved.columns : null;
      setRows(parsed);
      setColumns(reuse ?? detected);
      setFileName(file.name);
      if (!name) setName(file.name.replace(/\.[^.]+$/, ""));
    } catch (cause) {
      setError(message(cause));
    }
  }

  const header = rows?.[0] ?? [];
  const result = useMemo(
    () => (rows && columns ? buildRecords(rows, { columns, linkPattern: linkPattern.trim(), now }) : null),
    [rows, columns, linkPattern, now],
  );
  const missingRequired = columns ? REQUIRED.filter((field) => columns[field] < 0) : [];
  const counts = result
    ? (Object.keys(STATUS_LABELS) as (keyof typeof STATUS_LABELS)[])
        .map((status) => [status, result.records.filter((record) => record.level === "item" && record.status === status).length] as const)
        .filter(([, count]) => count > 0)
    : [];
  const epics = result?.records.filter((record) => record.level === "epic").length ?? 0;
  const items = (result?.records.length ?? 0) - epics;

  async function runImport() {
    if (!result || !columns || !fileName) return;
    setImporting(true);
    setError(null);
    try {
      const settings: ImportSettings = { columns, linkPattern: linkPattern.trim(), fileName, importedAt: Date.now(), count: result.records.length };
      const label = name.trim() || fileName;
      let connection = existing;
      if (connection) {
        await store.connections.updateConfig(connection.id, { settings: JSON.stringify(settings) });
      } else {
        connection = await store.connections.add("ticket-file", label, { settings: JSON.stringify(settings) });
      }
      await store.work.replaceSource(sourceOf(connection.id), connection.name, result.records);
      await store.connections.recordSync(connection.id, Date.now(), {});
      await onDone();
    } catch (cause) {
      setError(message(cause));
    } finally {
      setImporting(false);
    }
  }

  const sample = rows?.[1] ?? [];

  return (
    <div className="connect-form import-form">
      <h2>{existing ? `Import a newer file into ${existing.name}` : "Import tickets from a file"}</h2>
      <p className="muted small">
        Export tickets and epics from your tracker as CSV: in Jira, run a search and choose Export, then CSV (all fields).
        Include the epics, so tickets can be grouped under them.
        {existing ? " Tickets missing from the new file are removed." : ""}
      </p>
      <input
        ref={fileInput}
        type="file"
        accept=".csv,text/csv"
        className="visually-hidden"
        aria-label="CSV file"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void readFile(file);
          event.target.value = "";
        }}
      />
      <div>
        <Button icon={<FileUp size={15} aria-hidden="true" />} onClick={() => fileInput.current?.click()}>
          {fileName ? "Choose a different file" : "Choose a CSV file"}
        </Button>
        {fileName && <span className="muted small file-name">{fileName}</span>}
      </div>
      {error && <Alert type="error" showIcon title={error} />}

      {rows && columns && result && (
        <>
          <div className="pm-section">
            <h3>Columns</h3>
            <p className="muted small">Matched by name. Correct any that are wrong; the example is from the first row.</p>
            <ul className="column-map">
              {FIELDS.map((field) => (
                <li key={field}>
                  <span className={REQUIRED.includes(field) ? "alert-title" : ""}>
                    {FIELD_LABELS[field]}
                    {REQUIRED.includes(field) ? " *" : ""}
                  </span>
                  <Select<number>
                    size="small"
                    showSearch
                    optionFilterProp="label"
                    aria-label={`Column for ${FIELD_LABELS[field]}`}
                    value={columns[field]}
                    onChange={(value) => setColumns({ ...columns, [field]: value })}
                    options={[
                      { value: -1, label: "(none)" },
                      ...header.map((column, index) => ({ value: index, label: column || `Column ${index + 1}` })),
                    ]}
                  />
                  <span className="muted small sample">{columns[field] >= 0 ? sample[columns[field]] || "(empty)" : ""}</span>
                </li>
              ))}
            </ul>
          </div>

          <label className="field">
            Link to each ticket (optional)
            <Input
              value={linkPattern}
              placeholder="https://yourcompany.atlassian.net/browse/{key}"
              onChange={(event) => setLinkPattern(event.target.value)}
            />
            <span className="muted small">Put {"{key}"} where the ticket key goes, so tickets open in the tracker.</span>
          </label>

          {missingRequired.length > 0 ? (
            <Alert
              type="error"
              showIcon
              title={`Choose a column for: ${missingRequired.map((field) => FIELD_LABELS[field]).join(", ")}.`}
            />
          ) : (
            <div className="pm-section">
              <h3>Preview</h3>
              <p>
                {items} {items === 1 ? "ticket" : "tickets"} and {epics} {epics === 1 ? "epic" : "epics"}
                {counts.length > 0 && ": "}
                {counts.map(([status, count]) => (
                  <Tag key={status} variant="filled">
                    {count} {STATUS_LABELS[status].toLowerCase()}
                  </Tag>
                ))}
              </p>
              {result.skipped.length > 0 && (
                <Alert
                  type="warning"
                  showIcon
                  title={`${result.skipped.length} ${result.skipped.length === 1 ? "row" : "rows"} will be left out`}
                  description={result.skipped
                    .slice(0, 5)
                    .map((entry) => `Row ${entry.row}: ${entry.reason}`)
                    .join(". ")
                    .concat(result.skipped.length > 5 ? `, and ${result.skipped.length - 5} more.` : ".")}
                />
              )}
              {result.missing.length > 0 && (
                <p className="muted small">
                  Not in this file:{" "}
                  {result.missing.map((field) => `${FIELD_LABELS[field].toLowerCase()} (${MISSING_EFFECT[field]})`).join("; ")}.
                </p>
              )}
              <Table
                size="small"
                className="chart-table"
                pagination={false}
                rowKey="externalId"
                dataSource={result.records.slice(0, 6)}
                scroll={{ x: true }}
                columns={[
                  { title: "Key", dataIndex: "externalId" },
                  { title: "Title", dataIndex: "title", ellipsis: true },
                  { title: "Type", dataIndex: "kind" },
                  {
                    title: "Status",
                    key: "status",
                    render: (_, record) => `${record.statusLabel} → ${STATUS_LABELS[record.status]}${record.waitingOnProduct ? ", waiting on product" : ""}`,
                  },
                  { title: "Owner", dataIndex: "ownerName" },
                  { title: "Team", dataIndex: "team" },
                  { title: "Epic", dataIndex: "parentExternalId" },
                ]}
              />
            </div>
          )}

          {!existing && (
            <label className="field">
              Name in the app
              <Input value={name} onChange={(event) => setName(event.target.value)} />
            </label>
          )}
        </>
      )}

      <div className="note-actions">
        <Button onClick={onCancel}>Cancel</Button>
        <Button
          type="primary"
          loading={importing}
          disabled={!result || missingRequired.length > 0 || result.records.length === 0}
          onClick={() => void runImport()}
        >
          {result && missingRequired.length === 0 ? `Import ${result.records.length}` : "Import"}
        </Button>
      </div>
    </div>
  );
}
