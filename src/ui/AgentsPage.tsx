import { Alert, Button, Checkbox, Input, Popconfirm, Segmented, Select, Switch, Tag } from "antd";
import { Bot, Copy, Crown, Play, RotateCcw, Square, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { buildAgentContext, CONTEXT_LABELS, type ContextChoice } from "../core/agentContext";
import {
  agentRecord,
  changingToolsOf,
  describeCadence,
  nextOccurrence,
  TOOL_LABELS,
  type AgentRun,
  type Cadence,
} from "../core/agents";
import { stakeholderMap, type StakeholderProfile } from "../core/influence";
import type { Capture, Person } from "../core/models";
import type { CaptureStore } from "../core/store";
import type { WorkItem } from "../core/work";
import { isTauri } from "../platform";
import { GlassCard } from "./components";
import { quote, useToast } from "./Toast";
import type { Agents } from "./useAgents";
import { useSensitiveGuard } from "./useSensitiveGuard";

/** Thrown when David chose not to send after the sensitive-data warning; nothing to report. */
class NotSent extends Error {}
import { message } from "./useStore";

type Tab = "team" | "runs" | "schedules" | "settings";

const when = (time: number) => new Date(time).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

function took(run: AgentRun): string {
  const parts: string[] = [];
  const ms = run.durationMs ?? (run.finishedAt ? run.finishedAt - run.startedAt : null);
  if (ms !== null) parts.push(ms < 60_000 ? `${Math.max(1, Math.round(ms / 1000))} s` : `${Math.round(ms / 60_000)} min`);
  if (run.costUsd !== null && run.costUsd > 0) parts.push(`$${run.costUsd.toFixed(2)}`);
  return parts.join(" · ");
}

const STATUS: Record<string, { label: string; className: string }> = {
  running: { label: "Running", className: "running" },
  pending: { label: "Waiting for review", className: "waiting" },
  approved: { label: "Approved", className: "approved" },
  sent_back: { label: "Sent back", className: "" },
  rejected: { label: "Rejected", className: "" },
  failed: { label: "Failed", className: "failed" },
  cancelled: { label: "Stopped", className: "" },
};

const statusOf = (run: AgentRun) => (run.status === "done" ? (run.review ?? "pending") : run.status);

/** The agent team: who they are, what they are doing, what waits for review, and what repeats. */
export function AgentsPage({
  agents: rawTeam,
  store,
  work,
  captures,
  people,
  profiles,
  now,
}: {
  agents: Agents;
  store: CaptureStore;
  work: WorkItem[];
  captures: Capture[];
  people: Person[];
  profiles: StakeholderProfile[];
  now: number;
}) {
  const [tab, setTab] = useState<Tab>("team");
  const [openRun, setOpenRun] = useState<number | null>(null);
  const [guard, guardHolder] = useSensitiveGuard();
  // Every send to Claude from this page passes the sensitive-data check first.
  const team: Agents = {
    ...rawTeam,
    async start(request) {
      const runId = await guard((allowSensitive) => rawTeam.start({ ...request, allowSensitive }));
      if (runId === null) throw new NotSent();
      return runId;
    },
    async sendBack(run, feedback) {
      const runId = await guard((allowSensitive) => rawTeam.sendBack(run, feedback, allowSensitive));
      if (runId === null) throw new NotSent();
      return runId;
    },
  };
  const [chosenAgent, setChosenAgent] = useState<string | null>(null);

  const openRunPage = (runId: number) => {
    setOpenRun(runId);
    setTab("runs");
  };

  return (
    <div className="page">
      {guardHolder}
      <header className="page-head with-controls">
        <div>
          <h1>Agents</h1>
          <p>Your Claude Code agent team: give them work, review it, and set jobs to repeat.</p>
        </div>
        <Segmented<Tab>
          aria-label="Section"
          value={tab}
          onChange={setTab}
          options={[
            { value: "team", label: "Team" },
            { value: "runs", label: team.waiting > 0 ? `Runs · ${team.waiting}` : "Runs" },
            { value: "schedules", label: "Schedules" },
            { value: "settings", label: "Settings" },
          ]}
        />
      </header>

      {!isTauri && (
        <Alert
          type="info"
          showIcon
          title="Browser preview: invented sample agents, and runs are simulated. The Mac app reads your agent files and runs Claude Code."
        />
      )}
      {team.claude && !team.claude.ok && tab !== "settings" && (
        <Alert
          type="warning"
          showIcon
          title="Claude Code was not found"
          description={team.claude.reason}
          action={<Button onClick={() => setTab("settings")}>Settings</Button>}
        />
      )}

      {tab === "team" && (
        <TeamTab
          team={team}
          work={work}
          captures={captures}
          people={people}
          profiles={profiles}
          now={now}
          chosenAgent={chosenAgent}
          onChoose={setChosenAgent}
          onStarted={openRunPage}
          onSettings={() => setTab("settings")}
        />
      )}
      {tab === "runs" && <RunsTab team={team} store={store} openRun={openRun} onOpen={setOpenRun} />}
      {tab === "schedules" && <SchedulesTab team={team} store={store} now={now} onOpenRun={openRunPage} />}
      {tab === "settings" && <SettingsTab team={team} />}
    </div>
  );
}

// ---------- Team ----------

function TeamTab({
  team,
  work,
  captures,
  people,
  profiles,
  now,
  chosenAgent,
  onChoose,
  onStarted,
  onSettings,
}: {
  team: Agents;
  work: WorkItem[];
  captures: Capture[];
  people: Person[];
  profiles: StakeholderProfile[];
  now: number;
  chosenAgent: string | null;
  onChoose: (id: string) => void;
  onStarted: (runId: number) => void;
  onSettings: () => void;
}) {
  const toast = useToast();
  const { agents, lead, settings } = team;

  if (team.loading) return null;
  if (agents.length === 0) {
    return (
      <GlassCard className="team-empty">
        <h2>No agents found</h2>
        <p className="muted">
          {team.folderError ?? `There are no agent files in ${settings.folder}.`} The app reads Claude Code agent files
          (the .md files in a .claude/agents folder) and never changes them.
        </p>
        <div className="note-actions start">
          <Button type="primary" onClick={onSettings}>
            Choose the agent folder
          </Button>
          <Button onClick={() => void team.reloadTeam()}>Look again</Button>
        </div>
      </GlassCard>
    );
  }

  const ordered = lead ? [lead, ...agents.filter((agent) => agent.id !== lead.id)] : agents;

  return (
    <>
      <JobForm
        team={team}
        work={work}
        captures={captures}
        people={people}
        profiles={profiles}
        now={now}
        chosenAgent={chosenAgent}
        onChoose={onChoose}
        onStarted={onStarted}
      />

      {team.problems.length > 0 && (
        <Alert
          type="warning"
          showIcon
          title={`${team.problems.length} ${team.problems.length === 1 ? "file was" : "files were"} left out`}
          description={team.problems.map((problem) => `${problem.fileName}: ${problem.problem}`).join(" ")}
        />
      )}

      <div className="team-grid agent-grid">
        {ordered.map((agent, index) => {
          const record = agentRecord(team.runs, agent.id);
          const changing = changingToolsOf(agent);
          const switchedOn = settings.switchedOn[agent.id] ?? [];
          const running = team.runs.filter((run) => run.agentId === agent.id && run.status === "running").length;
          return (
            <GlassCard key={agent.id} className="pm-card agent-card" index={index} aria-label={agent.name}>
              <header className="roadmap-head">
                <span className="avatar" aria-hidden="true">
                  {agent.id === lead?.id ? <Crown size={18} /> : <Bot size={18} />}
                </span>
                <div>
                  <h2>{agent.name}</h2>
                  <p className="muted small">
                    {[agent.id === lead?.id ? "Lead" : null, agent.model ?? "Default model", agent.fileName].filter(Boolean).join(" · ")}
                  </p>
                </div>
                {running > 0 && (
                  <Tag className="run-state running" variant="filled">
                    Running
                  </Tag>
                )}
              </header>
              <p className="agent-description">{agent.description || "No description in its file."}</p>

              <div className="pm-section">
                <h3>Can use</h3>
                <p className="tool-chips">
                  {(agent.tools ?? ["All read-only tools"]).map((tool) => (
                    <Tag key={tool} variant="filled" className={changing.includes(tool) && !switchedOn.includes(tool) ? "tool off" : "tool"}>
                      {TOOL_LABELS[tool] ?? tool}
                      {changing.includes(tool) && !switchedOn.includes(tool) ? " (off)" : ""}
                    </Tag>
                  ))}
                </p>
                {changing.length > 0 && (
                  <ul className="tool-switches">
                    {changing.map((tool) => (
                      <li key={tool}>
                        <Switch
                          size="small"
                          checked={switchedOn.includes(tool)}
                          aria-label={`Let ${agent.name} ${(TOOL_LABELS[tool] ?? tool).toLowerCase()}`}
                          onChange={(on) =>
                            void team
                              .saveSettings({
                                ...settings,
                                switchedOn: {
                                  ...settings.switchedOn,
                                  [agent.id]: on ? [...switchedOn, tool] : switchedOn.filter((entry) => entry !== tool),
                                },
                              })
                              .catch((cause) => toast({ text: message(cause) }))
                          }
                        />
                        <span className="small">
                          Allow: {TOOL_LABELS[tool] ?? tool}
                          <span className="muted"> {switchedOn.includes(tool) ? "(on for this agent)" : "(off: it can only read)"}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <p className="muted small">
                {record.runs === 0
                  ? "No runs yet."
                  : [
                      `${record.runs} ${record.runs === 1 ? "run" : "runs"}`,
                      record.decided > 0 ? `${record.approvedFirstTime} of ${record.decided} approved first time` : null,
                      record.waiting > 0 ? `${record.waiting} to review` : null,
                      record.failed > 0 ? `${record.failed} failed` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
              </p>
              <div className="pm-actions">
                <Button
                  size="small"
                  type="primary"
                  icon={<Play size={13} aria-hidden="true" />}
                  onClick={() => {
                    onChoose(agent.id);
                    document.getElementById("job-brief")?.focus();
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                >
                  Give a job
                </Button>
                {agent.id !== lead?.id && (
                  <Button size="small" onClick={() => void team.saveSettings({ ...settings, leadId: agent.id })}>
                    Make lead
                  </Button>
                )}
              </div>
            </GlassCard>
          );
        })}
      </div>
    </>
  );
}

function JobForm({
  team,
  work,
  captures,
  people,
  profiles,
  now,
  chosenAgent,
  onChoose,
  onStarted,
}: {
  team: Agents;
  work: WorkItem[];
  captures: Capture[];
  people: Person[];
  profiles: StakeholderProfile[];
  now: number;
  chosenAgent: string | null;
  onChoose: (id: string) => void;
  onStarted: (runId: number) => void;
}) {
  const toast = useToast();
  const [brief, setBrief] = useState("");
  const [choices, setChoices] = useState<ContextChoice[]>([]);
  const [stakeholderId, setStakeholderId] = useState<number | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stakeholders = useMemo(() => stakeholderMap(profiles, people, captures, now), [profiles, people, captures, now]);
  const agentId = chosenAgent ?? team.lead?.id ?? team.agents[0]?.id;
  const agent = team.agents.find((entry) => entry.id === agentId) ?? null;

  const context = useMemo(
    () =>
      buildAgentContext(choices, {
        work,
        captures,
        people,
        stakeholder: stakeholders.find((entry) => entry.person.id === stakeholderId) ?? null,
        now,
      }),
    [choices, work, captures, people, stakeholders, stakeholderId, now],
  );

  async function run() {
    if (!agent || !brief.trim()) return;
    setStarting(true);
    setError(null);
    try {
      const runId = await team.start({ agent, brief, context: context.text ? context : undefined });
      toast({ text: `${agent.name} is on it: ${quote(brief, 40)}` });
      setBrief("");
      setChoices([]);
      onStarted(runId);
    } catch (cause) {
      if (!(cause instanceof NotSent)) setError(message(cause));
    } finally {
      setStarting(false);
    }
  }

  const available: { value: ContextChoice; label: string; disabled?: boolean }[] = [
    { value: "work", label: CONTEXT_LABELS.work, disabled: work.length === 0 },
    { value: "commitments", label: CONTEXT_LABELS.commitments },
    { value: "bank", label: CONTEXT_LABELS.bank },
    { value: "stakeholder", label: CONTEXT_LABELS.stakeholder, disabled: stakeholders.length === 0 },
  ];

  return (
    <GlassCard aria-labelledby="job-title" className="job-form">
      <h2 id="job-title">Give the team a job</h2>
      <div className="job-row">
        <label className="field">
          Agent
          <Select
            aria-label="Agent"
            value={agentId}
            onChange={onChoose}
            options={team.agents.map((entry) => ({
              value: entry.id,
              label: entry.id === team.lead?.id ? `${entry.name} (lead, hands work to the others)` : entry.name,
            }))}
          />
        </label>
      </div>
      <label className="field">
        Brief
        <Input.TextArea
          id="job-brief"
          aria-label="Brief"
          value={brief}
          autoSize={{ minRows: 3, maxRows: 10 }}
          placeholder="What you need, who it is for, and what good looks like. The first line becomes the job's name."
          onChange={(event) => setBrief(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              void run();
            }
          }}
        />
      </label>
      <div className="field">
        <span>Attach from the app</span>
        <Checkbox.Group<ContextChoice>
          className="context-choices"
          value={choices}
          onChange={setChoices}
          options={available}
        />
        {choices.includes("stakeholder") && (
          <Select
            aria-label="Executive"
            placeholder="Whose profile?"
            value={stakeholderId ?? undefined}
            onChange={setStakeholderId}
            options={stakeholders.map((entry) => ({
              value: entry.person.id,
              label: entry.profile.title ? `${entry.person.name}, ${entry.profile.title}` : entry.person.name,
            }))}
          />
        )}
        <span className="muted small">
          Attached text goes to Claude with the brief. Leave out customer and patient data until IT confirms Claude may receive it.
        </span>
      </div>
      {error && <Alert type="error" showIcon title={error} />}
      <div className="note-actions">
        <span className="muted small">{agent?.id === team.lead?.id ? "The lead can hand parts of the job to the others." : ""}</span>
        <Button type="primary" icon={<Play size={14} aria-hidden="true" />} loading={starting} disabled={!agent || !brief.trim()} onClick={() => void run()}>
          Run
        </Button>
      </div>
    </GlassCard>
  );
}

// ---------- Runs ----------

function RunsTab({
  team,
  store,
  openRun,
  onOpen,
}: {
  team: Agents;
  store: CaptureStore;
  openRun: number | null;
  onOpen: (runId: number | null) => void;
}) {
  const waiting = team.runs.filter((run) => run.review === "pending");
  const running = team.runs.filter((run) => run.status === "running");
  const rest = team.runs.filter((run) => run.review !== "pending" && run.status !== "running");
  const selected = team.runs.find((run) => run.id === openRun) ?? waiting[0] ?? running[0] ?? null;

  if (team.runs.length === 0) {
    return (
      <GlassCard className="team-empty">
        <h2>No runs yet</h2>
        <p className="muted">Give an agent a job on the Team tab. Each run is kept here, and finished work waits for your review.</p>
      </GlassCard>
    );
  }

  const list = (title: string, runs: AgentRun[], empty: string) => (
    <div className="pm-section">
      <h3>
        {title} {runs.length > 0 && <span className="count">{runs.length}</span>}
      </h3>
      {runs.length === 0 ? (
        <p className="muted small">{empty}</p>
      ) : (
        <ul className="run-list">
          {runs.map((run) => {
            const status = STATUS[statusOf(run)];
            return (
              <li key={run.id}>
                <button
                  className={selected?.id === run.id ? "run-row selected" : "run-row"}
                  aria-current={selected?.id === run.id ? "true" : undefined}
                  onClick={() => onOpen(run.id)}
                >
                  <span className="run-title">{run.title}</span>
                  <span className="muted small">
                    {run.agentName} · {when(run.startedAt)}
                    {run.parentId !== null ? " · revision" : ""}
                    {run.scheduleId !== null ? " · scheduled" : ""}
                  </span>
                  <Tag variant="filled" className={`run-state ${status.className}`}>
                    {status.label}
                  </Tag>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );

  return (
    <div className="runs-layout">
      <GlassCard className="run-lists" aria-label="Runs">
        {list("To review", waiting, "Nothing waiting for you.")}
        {running.length > 0 && list("Running", running, "")}
        {list("Earlier", rest.slice(0, 50), "Nothing yet.")}
      </GlassCard>
      {selected ? <RunDetail key={selected.id} run={selected} team={team} store={store} onOpen={onOpen} /> : null}
    </div>
  );
}

function RunDetail({ run, team, store, onOpen }: { run: AgentRun; team: Agents; store: CaptureStore; onOpen: (runId: number) => void }) {
  const toast = useToast();
  const [feedback, setFeedback] = useState("");
  const [sendingBack, setSendingBack] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const steps = team.live[run.id] ?? run.steps;
  const status = STATUS[statusOf(run)];
  const parent = team.runs.find((entry) => entry.id === run.parentId);
  const revision = team.runs.find((entry) => entry.parentId === run.id);

  useEffect(() => setError(null), [run.id]);

  const act = async (work: () => Promise<unknown>) => {
    setError(null);
    try {
      await work();
    } catch (cause) {
      if (!(cause instanceof NotSent)) setError(message(cause));
    }
  };

  return (
    <GlassCard className="run-detail" aria-labelledby="run-title">
      <header className="run-head">
        <div>
          <h2 id="run-title">{run.title}</h2>
          <p className="muted small">
            {run.agentName} · started {when(run.startedAt)}
            {took(run) ? ` · ${took(run)}` : ""}
          </p>
        </div>
        <Tag variant="filled" className={`run-state ${status.className}`}>
          {status.label}
        </Tag>
      </header>

      {parent && (
        <p className="small">
          Revision of{" "}
          <button className="text-link" onClick={() => onOpen(parent.id)}>
            the earlier run
          </button>
          , sent back with: “{parent.feedback}”
        </p>
      )}
      {revision && (
        <p className="small">
          Sent back with “{run.feedback}”.{" "}
          <button className="text-link" onClick={() => onOpen(revision.id)}>
            See the revision
          </button>
        </p>
      )}

      <details className="run-brief">
        <summary>Brief{run.attached.length > 0 ? ` and ${run.attached.join(", ").toLowerCase()}` : ""}</summary>
        <p>{run.brief}</p>
      </details>

      {run.status === "running" && (
        <div className="pm-section">
          <h3>Progress</h3>
          <ol className="run-steps" aria-live="polite">
            {steps.length === 0 ? <li className="muted">Starting Claude Code…</li> : steps.slice(-8).map((step, index) => <li key={index}>{step.text}</li>)}
          </ol>
          <Button danger icon={<Square size={13} aria-hidden="true" />} onClick={() => void act(() => team.cancel(run.id))}>
            Stop
          </Button>
        </div>
      )}

      {run.status === "failed" && <Alert type="error" showIcon title="The run failed" description={<span className="pre">{run.error}</span>} />}

      {run.output && (
        <div className="pm-section">
          <h3>What came back</h3>
          <div className="run-output" tabIndex={0}>
            {run.output}
          </div>
        </div>
      )}

      {error && <Alert type="error" showIcon title={error} />}

      {run.review === "pending" && (
        <div className="review-actions">
          <Input.TextArea
            aria-label="Feedback"
            value={feedback}
            autoSize={{ minRows: 2, maxRows: 6 }}
            placeholder="To send it back, say what to change. The agent gets its answer and your feedback."
            onChange={(event) => setFeedback(event.target.value)}
          />
          <div className="note-actions">
            <Button
              onClick={() =>
                void act(async () => {
                  await team.reject(run);
                  toast({ text: `Rejected ${quote(run.title, 40)}`, undo: () => team.undoReview(run) });
                })
              }
            >
              Reject
            </Button>
            <Button
              loading={sendingBack}
              disabled={!feedback.trim()}
              icon={<RotateCcw size={14} aria-hidden="true" />}
              onClick={() =>
                void act(async () => {
                  setSendingBack(true);
                  try {
                    const next = await team.sendBack(run, feedback);
                    toast({ text: `Sent back to ${run.agentName}; a revision is running` });
                    onOpen(next);
                  } finally {
                    setSendingBack(false);
                  }
                })
              }
            >
              Send back
            </Button>
            <Button
              type="primary"
              onClick={() =>
                void act(async () => {
                  await team.approve(run);
                  toast({ text: `Approved ${quote(run.title, 40)}`, undo: () => team.undoReview(run) });
                })
              }
            >
              Approve
            </Button>
          </div>
        </div>
      )}

      <div className="note-actions">
        {(run.status === "failed" || run.status === "cancelled") && (
          <Button
            icon={<RotateCcw size={14} aria-hidden="true" />}
            onClick={() =>
              void act(async () => {
                const agent = team.agents.find((entry) => entry.id === run.agentId);
                if (!agent) throw new Error(`${run.agentName} is no longer in the agent folder.`);
                onOpen(await team.start({ agent, brief: run.brief, parentId: run.parentId, scheduleId: run.scheduleId }));
              })
            }
          >
            Run again
          </Button>
        )}
        {run.status !== "running" && (
          <Popconfirm
            title="Delete this run?"
            description="Its brief and output are removed from this Mac."
            okText="Delete"
            okButtonProps={{ danger: true }}
            onConfirm={() =>
              void act(async () => {
                await store.agents.deleteRun(run.id);
                await team.refresh();
              })
            }
          >
            <Button type="text" className="danger-hover" icon={<Trash2 size={14} aria-hidden="true" />} aria-label="Delete run" />
          </Popconfirm>
        )}
        {run.output && (
          <Button
            icon={<Copy size={14} aria-hidden="true" />}
            onClick={() =>
              navigator.clipboard.writeText(run.output).then(
                () => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                },
                () => setError("Could not copy. Select the text and copy it instead."),
              )
            }
          >
            {copied ? "Copied" : "Copy"}
          </Button>
        )}
      </div>
    </GlassCard>
  );
}

// ---------- Schedules ----------

const WEEKDAY_OPTIONS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map((label, value) => ({ label, value }));

function SchedulesTab({ team, store, now, onOpenRun }: { team: Agents; store: CaptureStore; now: number; onOpenRun: (runId: number) => void }) {
  const [agentId, setAgentId] = useState<string | undefined>(team.lead?.id ?? team.agents[0]?.id);
  const [brief, setBrief] = useState("");
  const [cadence, setCadence] = useState<Cadence>({ every: "week", weekday: 1, time: "08:00" });
  const [error, setError] = useState<string | null>(null);
  const agentName = (id: string) => team.agents.find((agent) => agent.id === id)?.name ?? `${id} (not in the folder)`;

  const act = async (work: () => Promise<unknown>) => {
    setError(null);
    try {
      await work();
      await team.refresh();
    } catch (cause) {
      if (!(cause instanceof NotSent)) setError(message(cause));
    }
  };

  return (
    <>
      <GlassCard aria-labelledby="schedule-title" className="job-form">
        <h2 id="schedule-title">Repeat a job</h2>
        <p className="muted small">Runs while this Mac is awake and the app is open. A run missed while it was closed happens once at the next launch.</p>
        <div className="job-row">
          <label className="field">
            Agent
            <Select aria-label="Agent for the schedule" value={agentId} onChange={setAgentId} options={team.agents.map((agent) => ({ value: agent.id, label: agent.name }))} />
          </label>
          <label className="field">
            How often
            <Segmented<Cadence["every"]>
              aria-label="How often"
              value={cadence.every}
              onChange={(every) => setCadence({ ...cadence, every })}
              options={[
                { value: "day", label: "Every day" },
                { value: "weekday", label: "Weekdays" },
                { value: "week", label: "Weekly" },
              ]}
            />
          </label>
          {cadence.every === "week" && (
            <label className="field">
              On
              <Select aria-label="Day" value={cadence.weekday} onChange={(weekday) => setCadence({ ...cadence, weekday })} options={WEEKDAY_OPTIONS} />
            </label>
          )}
          <label className="field">
            At
            <input
              type="time"
              className="ant-input time-input"
              aria-label="Time"
              value={cadence.time}
              onChange={(event) => event.target.value && setCadence({ ...cadence, time: event.target.value })}
            />
          </label>
        </div>
        <label className="field">
          Brief
          <Input.TextArea
            aria-label="Schedule brief"
            value={brief}
            autoSize={{ minRows: 2, maxRows: 8 }}
            placeholder="For example: Summarize last week's shipped tickets and risks for my Monday update."
            onChange={(event) => setBrief(event.target.value)}
          />
        </label>
        {error && <Alert type="error" showIcon title={error} />}
        <div className="note-actions">
          <span className="muted small">{describeCadence(cadence)}</span>
          <Button
            type="primary"
            disabled={!agentId || !brief.trim()}
            onClick={() =>
              void act(async () => {
                await store.agents.addSchedule({ agentId: agentId!, brief, cadence });
                setBrief("");
              })
            }
          >
            Add schedule
          </Button>
        </div>
      </GlassCard>

      {team.schedules.length === 0 ? (
        <GlassCard className="team-empty">
          <h2>Nothing repeats yet</h2>
          <p className="muted">A weekly status summary or a Monday competitor scan are good first schedules.</p>
        </GlassCard>
      ) : (
        <GlassCard aria-label="Schedules">
          <ul className="items schedule-list">
            {team.schedules.map((schedule) => {
              const lastRun = team.runs.find((run) => run.scheduleId === schedule.id);
              const agent = team.agents.find((entry) => entry.id === schedule.agentId);
              return (
                <li key={schedule.id} className="item">
                  <div className="item-text">
                    <p className="alert-title">{schedule.brief.split("\n")[0]}</p>
                    <p className="muted small">
                      {agentName(schedule.agentId)} · {describeCadence(schedule.cadence)}
                      {schedule.enabled ? ` · next ${when(nextOccurrence(schedule.cadence, now))}` : " · paused"}
                    </p>
                    {lastRun && (
                      <p className="small">
                        Last run {when(lastRun.startedAt)}:{" "}
                        <button className="text-link" onClick={() => onOpenRun(lastRun.id)}>
                          {STATUS[statusOf(lastRun)].label.toLowerCase()}
                        </button>
                      </p>
                    )}
                  </div>
                  <div className="item-actions schedule-actions">
                    <Button
                      size="small"
                      icon={<Play size={13} aria-hidden="true" />}
                      disabled={!agent}
                      onClick={() =>
                        void act(async () => {
                          await store.agents.markScheduleRun(schedule.id);
                          onOpenRun(await team.start({ agent: agent!, brief: schedule.brief, scheduleId: schedule.id }));
                        })
                      }
                    >
                      Run now
                    </Button>
                    <Switch
                      size="small"
                      checked={schedule.enabled}
                      aria-label={schedule.enabled ? "Pause schedule" : "Resume schedule"}
                      onChange={(enabled) => void act(() => store.agents.setScheduleEnabled(schedule.id, enabled))}
                    />
                    <Popconfirm
                      title="Delete this schedule?"
                      description="Its past runs are kept."
                      okText="Delete"
                      okButtonProps={{ danger: true }}
                      onConfirm={() => void act(() => store.agents.deleteSchedule(schedule.id))}
                    >
                      <Button size="small" type="text" className="danger-hover" icon={<Trash2 size={14} aria-hidden="true" />} aria-label="Delete schedule" />
                    </Popconfirm>
                  </div>
                </li>
              );
            })}
          </ul>
        </GlassCard>
      )}
    </>
  );
}

// ---------- Settings ----------

function SettingsTab({ team }: { team: Agents }) {
  const toast = useToast();
  const [values, setValues] = useState(team.settings);
  const [saving, setSaving] = useState(false);
  const changed =
    values.folder !== team.settings.folder || values.claudePath !== team.settings.claudePath || values.workFolder !== team.settings.workFolder;

  return (
    <GlassCard className="job-form" aria-labelledby="agent-settings">
      <h2 id="agent-settings">Settings</h2>
      <label className="field">
        Agent folder
        <Input value={values.folder} onChange={(event) => setValues({ ...values, folder: event.target.value })} />
        <span className="muted small">
          Where your agent files are. ~/.claude/agents holds the agents Claude Code offers in every project; a project's own are in
          its .claude/agents folder. The app only reads them.
        </span>
      </label>
      <label className="field">
        Work folder
        <Input value={values.workFolder} onChange={(event) => setValues({ ...values, workFolder: event.target.value })} />
        <span className="muted small">
          Where runs start. Agents that read and search files see this folder. Point it at a project folder to give them its files.
        </span>
      </label>
      <label className="field">
        Claude Code location (optional)
        <Input
          value={values.claudePath}
          placeholder="Found automatically"
          onChange={(event) => setValues({ ...values, claudePath: event.target.value })}
        />
        <span className="muted small">
          {team.claude === null
            ? "Checking…"
            : team.claude.ok
              ? `Using ${team.claude.program}, signed in as you in Claude Code.`
              : team.claude.reason}
        </span>
      </label>
      <Alert
        type="info"
        showIcon
        title="Agents can only read until you say otherwise"
        description="Tools that change files, run commands or act in other systems are off for every agent. Switch them on one agent at a time on the Team tab. Everything an agent produces waits for your review."
      />
      <div className="note-actions">
        <Button onClick={() => void team.reloadTeam()}>Read the folder again</Button>
        <Button
          type="primary"
          loading={saving}
          disabled={!changed}
          onClick={() => {
            setSaving(true);
            team
              .saveSettings({ ...team.settings, folder: values.folder.trim(), workFolder: values.workFolder.trim(), claudePath: values.claudePath.trim() })
              .then(
                () => toast({ text: "Agent settings saved" }),
                (cause) => toast({ text: message(cause) }),
              )
              .finally(() => setSaving(false));
          }}
        >
          Save
        </Button>
      </div>
    </GlassCard>
  );
}
