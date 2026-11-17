import { useCallback, useEffect, useRef, useState } from "react";
import {
  AGENT_SETTINGS,
  claudeArgs,
  completeAgentSettings,
  composePrompt,
  findLead,
  isDue,
  parseStreamLine,
  readTeam,
  type AgentDefinition,
  type AgentFileProblem,
  type AgentRun,
  type AgentSchedule,
  type AgentSettings,
  type RunResult,
  type RunStep,
} from "../core/agents";
import { askClaude, findSensitive, SensitiveDataError, type Purpose } from "../core/claude";
import type { CaptureStore } from "../core/store";
import { platformAgentRunner } from "../platform";
import { message } from "./useStore";

const runner = platformAgentRunner();

/** How often the main window looks for scheduled jobs that are due. */
const SCHEDULE_CHECK_MS = 60_000;

export interface StartRequest {
  agent: AgentDefinition;
  brief: string;
  /** Text attached from the app, and labels for what it was. */
  context?: { text: string; labels: string[] };
  parentId?: number | null;
  scheduleId?: number | null;
  previous?: { output: string; feedback: string };
  /** David saw the sensitive-data warning and chose to send anyway. */
  allowSensitive?: boolean;
}

export interface Agents {
  settings: AgentSettings;
  agents: AgentDefinition[];
  problems: AgentFileProblem[];
  lead: AgentDefinition | null;
  /** Why the folder could not be read, if it could not. */
  folderError: string | null;
  /** Whether Claude Code was found, and where, or why not. */
  claude: { ok: true; program: string } | { ok: false; reason: string } | null;
  runs: AgentRun[];
  schedules: AgentSchedule[];
  /** Steps of runs in progress, by run id. */
  live: Record<number, RunStep[]>;
  loading: boolean;
  /** How many finished runs wait for David's review. */
  waiting: number;
  reloadTeam: () => Promise<void>;
  saveSettings: (next: AgentSettings) => Promise<void>;
  start: (request: StartRequest) => Promise<number>;
  cancel: (runId: number) => Promise<void>;
  approve: (run: AgentRun) => Promise<void>;
  reject: (run: AgentRun) => Promise<void>;
  sendBack: (run: AgentRun, feedback: string, allowSensitive?: boolean) => Promise<number>;
  undoReview: (run: AgentRun) => Promise<void>;
  refresh: () => Promise<void>;
  /** Asks Claude one question with no tools; checked and logged like an agent run. */
  ask: (request: { purpose: Purpose; system: string; prompt: string; allowSensitive?: boolean }) => Promise<string>;
}

/**
 * The agent team, its runs and its schedules. Used once, in the main window, so runs keep
 * going while David moves between pages and schedules are checked in one place only.
 */
export function useAgents(store: CaptureStore, onChanged: () => void): Agents {
  const [settings, setSettings] = useState<AgentSettings>(completeAgentSettings(null));
  const [team, setTeam] = useState<{ agents: AgentDefinition[]; problems: AgentFileProblem[] }>({ agents: [], problems: [] });
  const [folderError, setFolderError] = useState<string | null>(null);
  const [claude, setClaude] = useState<Agents["claude"]>(null);
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [schedules, setSchedules] = useState<AgentSchedule[]>([]);
  const [live, setLive] = useState<Record<number, RunStep[]>>({});
  const [loading, setLoading] = useState(true);
  const cancelled = useRef(new Set<number>());
  // The app passes a new callback each render; keep the latest without re-creating everything.
  const onChangedRef = useRef(onChanged);
  onChangedRef.current = onChanged;
  // Stops two schedule checks from overlapping and starting the same job twice.
  const checking = useRef(false);
  const latest = useRef({ settings, agents: team.agents, schedules });
  latest.current = { settings, agents: team.agents, schedules };

  const refresh = useCallback(async () => {
    const [loadedRuns, loadedSchedules] = await Promise.all([store.agents.runs(), store.agents.schedules()]);
    setRuns(loadedRuns);
    setSchedules(loadedSchedules);
  }, [store]);

  const loadTeam = useCallback(async (current: AgentSettings) => {
    setClaude(await runner.check(current.claudePath));
    try {
      setTeam(readTeam(await runner.readFolder(current.folder)));
      setFolderError(null);
    } catch (cause) {
      setTeam({ agents: [], problems: [] });
      setFolderError(message(cause));
    }
  }, []);

  useEffect(() => {
    let stale = false;
    void (async () => {
      // Anything still "running" from before was cut off when the app closed.
      await store.agents.markInterrupted();
      const saved = completeAgentSettings(await store.settings.get<Partial<AgentSettings>>(AGENT_SETTINGS));
      if (stale) return;
      setSettings(saved);
      await Promise.all([loadTeam(saved), refresh()]);
      if (!stale) setLoading(false);
    })();
    return () => {
      stale = true;
    };
  }, [store, loadTeam, refresh]);

  const changed = useCallback(async () => {
    await refresh();
    onChangedRef.current();
  }, [refresh]);

  const start = useCallback(
    async (request: StartRequest): Promise<number> => {
      const current = latest.current.settings;
      const check = await runner.check(current.claudePath);
      setClaude(check);
      if (!check.ok) throw new Error(check.reason);
      const { agent } = request;
      const prompt = composePrompt({ brief: request.brief, context: request.context?.text, previous: request.previous });
      const findings = findSensitive(prompt);
      if (findings.length > 0 && !request.allowSensitive) throw new SensitiveDataError(findings);
      const runId = await store.agents.startRun({
        agentId: agent.id,
        agentName: agent.name,
        brief: request.brief,
        attached: request.context?.labels ?? [],
        parentId: request.parentId ?? null,
        scheduleId: request.scheduleId ?? null,
      });
      const logId = await store.claudeLog.add({ purpose: "agent", agentName: agent.name, runId, system: agent.prompt, prompt, warnings: findings });
      setLive((now) => ({ ...now, [runId]: [] }));
      await changed();

      // Runs to the end in the background; the caller only waits for it to start.
      void (async () => {
        const steps: RunStep[] = [];
        let result: RunResult | null = null;
        try {
          const exit = await runner.start(
            {
              runId,
              program: check.program,
              args: claudeArgs(agent, current.switchedOn[agent.id] ?? []),
              prompt,
              cwd: current.workFolder,
            },
            (line) => {
              for (const event of parseStreamLine(line)) {
                if (!event) continue;
                if ("result" in event) result = event.result;
                else {
                  steps.push(event.step);
                  setLive((now) => ({ ...now, [runId]: [...steps.slice(-60)] }));
                }
              }
            },
          );
          const finished = result as RunResult | null;
          await store.claudeLog.finish(logId, {
            status: finished && !finished.isError ? "done" : "failed",
            response: finished?.output || exit.stderr.trim().split("\n").slice(-6).join("\n"),
            costUsd: finished?.costUsd,
            durationMs: finished?.durationMs,
          });
          if (cancelled.current.has(runId)) {
            await store.agents.finishRun(runId, { status: "cancelled", output: finished?.output ?? "", steps });
          } else if (finished && !finished.isError) {
            await store.agents.finishRun(runId, {
              status: "done",
              output: finished.output,
              costUsd: finished.costUsd,
              durationMs: finished.durationMs,
              steps,
            });
          } else {
            const reason =
              finished?.output ||
              exit.stderr.trim().split("\n").slice(-6).join("\n") ||
              (exit.code === null ? "Claude Code stopped." : `Claude Code stopped with exit code ${exit.code}.`);
            await store.agents.finishRun(runId, { status: "failed", error: reason, costUsd: finished?.costUsd, steps });
          }
        } catch (cause) {
          await store.agents.finishRun(runId, { status: "failed", error: message(cause), steps });
        } finally {
          cancelled.current.delete(runId);
          setLive((now) => {
            const next = { ...now };
            delete next[runId];
            return next;
          });
          await changed();
        }
      })();
      return runId;
    },
    [store, changed],
  );

  const cancel = useCallback(async (runId: number) => {
    cancelled.current.add(runId);
    await runner.cancel(runId);
  }, []);

  const agentFor = (run: AgentRun) => {
    const agent = latest.current.agents.find((entry) => entry.id === run.agentId);
    if (!agent) throw new Error(`${run.agentName} is no longer in the agent folder.`);
    return agent;
  };

  const sendBack = useCallback(
    async (run: AgentRun, feedback: string, allowSensitive = false) => {
      const agent = agentFor(run);
      const next = start({
        agent,
        brief: run.brief,
        parentId: run.id,
        scheduleId: run.scheduleId,
        previous: { output: run.output, feedback: feedback.trim() },
        allowSensitive,
      });
      // Marked sent back only once the revision has started, so a refused send changes nothing.
      const runId = await next;
      await store.agents.setReview(run.id, "sent_back", feedback.trim());
      await changed();
      return runId;
    },
    [store, start],
  );

  // Scheduled jobs: checked once the team is loaded, then every minute.
  useEffect(() => {
    if (loading) return;
    const check = async () => {
      if (checking.current) return;
      checking.current = true;
      try {
        await checkDue();
      } finally {
        checking.current = false;
      }
    };
    const checkDue = async () => {
      // Read the schedules fresh, so a run started a moment ago is not started again.
      const current = await store.agents.schedules();
      const { agents } = latest.current;
      const now = Date.now();
      for (const schedule of current.filter((entry) => isDue(entry, now))) {
        const agent = agents.find((entry) => entry.id === schedule.agentId);
        await store.agents.markScheduleRun(schedule.id, now);
        if (agent) {
          await start({ agent, brief: schedule.brief, scheduleId: schedule.id }).catch(async (cause) => {
            const runId = await store.agents.startRun({ agentId: schedule.agentId, agentName: agent.name, brief: schedule.brief, scheduleId: schedule.id });
            await store.agents.finishRun(runId, { status: "failed", error: message(cause) });
          });
        }
      }
      await refresh();
    };
    void check();
    const timer = setInterval(() => void check(), SCHEDULE_CHECK_MS);
    return () => clearInterval(timer);
  }, [loading, store, start, refresh]);

  return {
    settings,
    agents: team.agents,
    problems: team.problems,
    lead: findLead(team.agents, settings.leadId),
    folderError,
    claude,
    runs,
    schedules,
    live,
    loading,
    waiting: runs.filter((run) => run.review === "pending").length,
    reloadTeam: () => loadTeam(latest.current.settings),
    async saveSettings(next) {
      await store.settings.set(AGENT_SETTINGS, next);
      setSettings(next);
      await loadTeam(next);
    },
    start,
    cancel,
    async approve(run) {
      await store.agents.setReview(run.id, "approved");
      await changed();
    },
    async reject(run) {
      await store.agents.setReview(run.id, "rejected");
      await changed();
    },
    sendBack,
    async undoReview(run) {
      await store.agents.setReview(run.id, "pending", "");
      await changed();
    },
    refresh: changed,
    async ask(request) {
      const current = latest.current.settings;
      const check = await runner.check(current.claudePath);
      setClaude(check);
      if (!check.ok) throw new Error(check.reason);
      const result = await askClaude({ runner, log: store.claudeLog, program: check.program, workFolder: current.workFolder }, request);
      return result.output;
    },
  };
}
