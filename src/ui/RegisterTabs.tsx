import { Button, Input, Popconfirm, Progress, Segmented, Tag } from "antd";
import { Copy, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { dateInputFromDue, dueFromDateInput } from "../core/commitments";
import { DECISION_STATUS_LABELS, decisionRegister, registerText, type Decision, type DecisionDetails, type DecisionStatus } from "../core/decisions";
import { quoteMetric, summarize, type Metric, type MetricPoint } from "../core/metrics";
import type { Capture } from "../core/models";
import type { CaptureStore } from "../core/store";
import { GlassCard, Sparkline } from "./components";
import { useToast } from "./Toast";
import { message } from "./useStore";

const day = (time: number) => new Date(time).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

function useCopy(): [boolean, (text: string) => void] {
  const [copied, setCopied] = useState(false);
  return [
    copied,
    (text) =>
      void navigator.clipboard.writeText(text).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }),
  ];
}

// ---------- Decisions ----------

/** Every decision with why it was made, who agreed, and whether it still stands. */
export function DecisionsTab({ store, captures, now, change }: { store: CaptureStore; captures: Capture[]; now: number; change: (work: () => Promise<unknown>) => Promise<void> }) {
  const [details, setDetails] = useState<Map<number, DecisionDetails>>(new Map());
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState({ body: "", why: "", agreed: "" });
  const [copied, copy] = useCopy();

  const load = useCallback(() => store.decisions.all().then(setDetails), [store]);
  useEffect(() => {
    void load();
  }, [load, captures]);

  const register = useMemo(() => decisionRegister(captures, details, now, query), [captures, details, now, query]);
  const due = register.filter((entry) => entry.due).length;

  return (
    <>
      <GlassCard className="job-form" aria-labelledby="decision-add">
        <h2 id="decision-add">Record a decision</h2>
        <div className="job-row">
          <label className="field">
            Decision
            <Input aria-label="Decision" value={draft.body} placeholder="What was decided" onChange={(event) => setDraft({ ...draft, body: event.target.value })} />
          </label>
          <label className="field">
            Agreed by
            <Input aria-label="Agreed by" value={draft.agreed} placeholder="Jordan, Morgan" onChange={(event) => setDraft({ ...draft, agreed: event.target.value })} />
          </label>
        </div>
        <label className="field">
          Why
          <Input.TextArea aria-label="Why" value={draft.why} autoSize={{ minRows: 2, maxRows: 6 }} placeholder="The reasoning, and what was ruled out" onChange={(event) => setDraft({ ...draft, why: event.target.value })} />
        </label>
        <div className="note-actions">
          <span className="muted small">Decisions you capture anywhere appear here too; add the why when you have a minute.</span>
          <Button
            type="primary"
            icon={<Plus size={14} aria-hidden="true" />}
            disabled={!draft.body.trim()}
            onClick={() =>
              void change(async () => {
                const saved = await store.addCapture({ body: draft.body, kind: "decision" });
                await store.decisions.save(saved.id, { why: draft.why, agreed: draft.agreed, status: "standing", revisitAt: null });
                setDraft({ body: "", why: "", agreed: "" });
                await load();
              })
            }
          >
            Record
          </Button>
        </div>
      </GlassCard>

      <GlassCard className="job-form" aria-labelledby="register-title">
        <div className="run-head">
          <div>
            <h2 id="register-title">
              Decision register <span className="count">{register.length}</span>
            </h2>
            {due > 0 && <p className="small">{due === 1 ? "One decision is" : `${due} decisions are`} past the date you set to look at again.</p>}
          </div>
          <div className="head-controls">
            <Input className="search" allowClear aria-label="Filter decisions" placeholder="Filter" value={query} onChange={(event) => setQuery(event.target.value)} />
            <Button icon={<Copy size={14} aria-hidden="true" />} disabled={register.length === 0} onClick={() => copy(registerText(register))}>
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
        </div>
        {register.length === 0 ? (
          <p className="muted small">{query ? "No decisions match." : "No decisions captured yet."}</p>
        ) : (
          <ul className="decision-list">
            {register.map((decision) => (
              <DecisionRow
                key={decision.capture.id}
                decision={decision}
                onSave={(next) =>
                  void store.decisions.save(decision.capture.id, next).then(load, (cause) => console.warn(message(cause)))
                }
              />
            ))}
          </ul>
        )}
      </GlassCard>
    </>
  );
}

function DecisionRow({ decision, onSave }: { decision: Decision; onSave: (details: DecisionDetails) => void }) {
  const [values, setValues] = useState(decision.details);
  useEffect(() => setValues(decision.details), [decision.details]);
  const save = (next: DecisionDetails = values) => {
    if (JSON.stringify(next) !== JSON.stringify(decision.details)) onSave(next);
  };
  return (
    <li className={decision.due ? "decision due" : "decision"}>
      <div className="decision-head">
        <p className="alert-title">{decision.capture.body}</p>
        <span className="muted small">{day(decision.capture.createdAt)}</span>
        {decision.due && (
          <Tag variant="filled" className="run-state waiting">
            Revisit due
          </Tag>
        )}
      </div>
      <div className="decision-fields">
        <Input.TextArea
          aria-label={`Why: ${decision.capture.body}`}
          value={values.why}
          placeholder="Why it was decided"
          autoSize={{ minRows: 1, maxRows: 5 }}
          onChange={(event) => setValues({ ...values, why: event.target.value })}
          onBlur={() => save()}
        />
        <div className="decision-meta">
          <Input
            size="small"
            aria-label={`Agreed by: ${decision.capture.body}`}
            value={values.agreed}
            placeholder="Agreed by"
            onChange={(event) => setValues({ ...values, agreed: event.target.value })}
            onBlur={() => save()}
          />
          <Segmented<DecisionStatus>
            size="small"
            aria-label={`Status: ${decision.capture.body}`}
            value={values.status}
            onChange={(status) => {
              const next = { ...values, status };
              setValues(next);
              save(next);
            }}
            options={(Object.keys(DECISION_STATUS_LABELS) as DecisionStatus[]).map((status) => ({ value: status, label: DECISION_STATUS_LABELS[status] }))}
          />
          <label className="small muted revisit">
            Revisit by
            <input
              type="date"
              className="ant-input time-input"
              aria-label={`Revisit by: ${decision.capture.body}`}
              value={dateInputFromDue(values.revisitAt)}
              onChange={(event) => {
                const next = { ...values, revisitAt: dueFromDateInput(event.target.value) };
                setValues(next);
                save(next);
              }}
            />
          </label>
        </div>
      </div>
    </li>
  );
}

// ---------- Metrics ----------

/** Metrics with a target and a history, quotable in one line. */
export function MetricsTab({ store, now }: { store: CaptureStore; now: number }) {
  const toast = useToast();
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [points, setPoints] = useState<MetricPoint[]>([]);
  const [draft, setDraft] = useState({ name: "", unit: "%", target: "", higherIsBetter: true });
  const [values, setValues] = useState<Record<number, string>>({});
  const [copied, copy] = useCopy();

  const load = useCallback(async () => {
    const [loadedMetrics, loadedPoints] = await Promise.all([store.metrics.metrics(), store.metrics.points()]);
    setMetrics(loadedMetrics);
    setPoints(loadedPoints);
  }, [store]);
  useEffect(() => {
    void load();
  }, [load]);

  const act = (work: () => Promise<unknown>) => work().then(load, (cause) => toast({ text: message(cause) }));
  const summaries = metrics.map((metric) => summarize(metric, points));

  return (
    <>
      <GlassCard className="job-form" aria-labelledby="metric-add">
        <h2 id="metric-add">Track a metric</h2>
        <div className="job-row metric-form">
          <label className="field">
            Name
            <Input aria-label="Metric name" value={draft.name} placeholder="Refill pickup rate" onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
          </label>
          <label className="field">
            Unit
            <Input aria-label="Unit" value={draft.unit} placeholder="%" onChange={(event) => setDraft({ ...draft, unit: event.target.value })} />
          </label>
          <label className="field">
            Target
            <Input aria-label="Target" inputMode="decimal" value={draft.target} placeholder="Optional" onChange={(event) => setDraft({ ...draft, target: event.target.value })} />
          </label>
          <label className="field">
            Better when
            <Segmented<string>
              aria-label="Better when"
              value={draft.higherIsBetter ? "up" : "down"}
              onChange={(value) => setDraft({ ...draft, higherIsBetter: value === "up" })}
              options={[
                { value: "up", label: "Higher" },
                { value: "down", label: "Lower" },
              ]}
            />
          </label>
          <Button
            type="primary"
            disabled={!draft.name.trim()}
            onClick={() =>
              void act(async () => {
                const target = draft.target.trim() === "" ? null : Number(draft.target);
                if (target !== null && !Number.isFinite(target)) throw new Error("The target must be a number.");
                await store.metrics.add({ name: draft.name, unit: draft.unit, target, higherIsBetter: draft.higherIsBetter });
                setDraft({ name: "", unit: "%", target: "", higherIsBetter: true });
              })
            }
          >
            Add
          </Button>
        </div>
      </GlassCard>

      {summaries.length === 0 ? (
        <GlassCard className="team-empty">
          <h2>No metrics yet</h2>
          <p className="muted">Add the few numbers leadership asks about. Log a value whenever you see a new one, and quote it with its trend.</p>
        </GlassCard>
      ) : (
        <div className="team-grid">
          {summaries.map((summary, index) => (
            <GlassCard key={summary.metric.id} className="pm-card metric-card" index={index} aria-label={summary.metric.name}>
              <header className="run-head">
                <div>
                  <h2>{summary.metric.name}</h2>
                  <p className="muted small">
                    {summary.metric.target !== null ? `Target ${summary.metric.target}${summary.metric.unit}, ${summary.metric.higherIsBetter ? "higher" : "lower"} is better` : "No target"}
                  </p>
                </div>
                <Popconfirm title={`Stop tracking ${summary.metric.name}?`} description="Its history is deleted." okText="Delete" okButtonProps={{ danger: true }} onConfirm={() => void act(() => store.metrics.remove(summary.metric.id))}>
                  <Button type="text" size="small" className="danger-hover" icon={<Trash2 size={14} aria-hidden="true" />} aria-label={`Delete ${summary.metric.name}`} />
                </Popconfirm>
              </header>
              <div className="metric-value">
                <span className="stat-value">{summary.latest ? `${summary.latest.value}${summary.metric.unit}` : "–"}</span>
                {summary.points.length > 1 && <Sparkline values={summary.points.map((point) => point.value - Math.min(...summary.points.map((entry) => entry.value)) + 1)} />}
              </div>
              <p className="small">
                {summary.change === null
                  ? summary.latest
                    ? `Logged ${day(summary.latest.at)}.`
                    : "No values logged yet."
                  : `${summary.improving ? "Improving" : "Getting worse"}: ${summary.change > 0 ? "+" : ""}${Number.isInteger(summary.change) ? summary.change : summary.change.toFixed(1)}${summary.metric.unit} since ${day(summary.first!.at)}.`}
                {summary.onTarget ? " Target met." : ""}
              </p>
              {summary.progress !== null && <Progress percent={Math.round(summary.progress * 100)} size="small" aria-label={`${summary.metric.name}: progress to target`} />}
              <div className="pm-actions">
                <Input
                  size="small"
                  aria-label={`New value for ${summary.metric.name}`}
                  inputMode="decimal"
                  placeholder="New value"
                  value={values[summary.metric.id] ?? ""}
                  onChange={(event) => setValues({ ...values, [summary.metric.id]: event.target.value })}
                  onPressEnter={() => {
                    const raw = values[summary.metric.id]?.trim();
                    if (!raw) return;
                    void act(async () => {
                      await store.metrics.record(summary.metric.id, Number(raw), now);
                      setValues({ ...values, [summary.metric.id]: "" });
                    });
                  }}
                />
                <Button size="small" icon={<Copy size={13} aria-hidden="true" />} disabled={!summary.latest} onClick={() => copy(quoteMetric(summary))}>
                  {copied ? "Copied" : "Quote"}
                </Button>
              </div>
            </GlassCard>
          ))}
        </div>
      )}
    </>
  );
}
