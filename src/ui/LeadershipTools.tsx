import { Alert, Button, Input, Segmented, Select } from "antd";
import { Copy, Sparkles } from "lucide-react";
import { useState } from "react";
import type { Purpose } from "../core/claude";
import type { Stakeholder } from "../core/influence";
import {
  audienceOf,
  GENERIC_AUDIENCES,
  OBJECTIONS_SYSTEM,
  objectionsPrompt,
  SPEC_CHECK_SYSTEM,
  TRANSLATE_SYSTEM,
  translatePrompt,
  type Audience,
} from "../core/leadershipAI";
import { GlassCard } from "./components";
import type { Agents } from "./useAgents";
import { useSensitiveGuard } from "./useSensitiveGuard";
import { message } from "./useStore";

type Mode = "translate" | "objections" | "spec";

const MODES: Record<Mode, { label: string; purpose: Purpose; placeholder: string; button: string; needsAudience: boolean }> = {
  translate: {
    label: "Translate for an executive",
    purpose: "exec-translate",
    placeholder: "Paste an update, a status or a proposal. Claude rewrites it in the terms this executive cares about.",
    button: "Translate",
    needsAudience: true,
  },
  objections: {
    label: "Prepare for objections",
    purpose: "objection-prep",
    placeholder: "Paste the proposal or pre-read. Claude lists the pushback to expect and honest answers.",
    button: "Find likely objections",
    needsAudience: true,
  },
  spec: {
    label: "Check a spec",
    purpose: "spec-check",
    placeholder: "Paste a PRD or spec. Claude checks it against what engineering and stakeholders will need.",
    button: "Check the spec",
    needsAudience: false,
  },
};

/** A question to Claude from a page: guarded, with busy, answer and error state. */
export function useClaudeTask(ask: Agents["ask"]) {
  const [guard, holder] = useSensitiveGuard();
  const [answer, setAnswer] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (request: { purpose: Purpose; system: string; prompt: string }): Promise<string | null> => {
    setBusy(true);
    setError(null);
    try {
      const result = await guard((allowSensitive) => ask({ ...request, allowSensitive }));
      if (result !== null) setAnswer(result);
      return result;
    } catch (cause) {
      setError(message(cause));
      return null;
    } finally {
      setBusy(false);
    }
  };
  return { run, answer, setAnswer, busy, error, holder };
}

/** Rewrite for an executive, prepare for objections, or check a spec. */
export function ClaudeTools({ stakeholders, ask }: { stakeholders: Stakeholder[]; ask: Agents["ask"] }) {
  const [mode, setMode] = useState<Mode>("translate");
  const [text, setText] = useState("");
  const [audienceKey, setAudienceKey] = useState<string>(stakeholders[0] ? `person:${stakeholders[0].person.id}` : "role:0");
  const [copied, setCopied] = useState(false);
  const task = useClaudeTask(ask);
  const settings = MODES[mode];

  const audiences: { key: string; audience: Audience }[] = [
    ...stakeholders.map((entry) => ({ key: `person:${entry.person.id}`, audience: audienceOf(entry) })),
    ...GENERIC_AUDIENCES.map((audience, index) => ({ key: `role:${index}`, audience })),
  ];
  const audience = audiences.find((entry) => entry.key === audienceKey)?.audience ?? GENERIC_AUDIENCES[0];

  const go = () => {
    const request =
      mode === "translate"
        ? { purpose: settings.purpose, system: TRANSLATE_SYSTEM, prompt: translatePrompt(text, audience) }
        : mode === "objections"
          ? { purpose: settings.purpose, system: OBJECTIONS_SYSTEM, prompt: objectionsPrompt(text, audience) }
          : { purpose: settings.purpose, system: SPEC_CHECK_SYSTEM, prompt: text.trim() };
    void task.run(request);
  };

  return (
    <div className="tools-grid">
      {task.holder}
      <GlassCard className="job-form" aria-labelledby="tools-title">
        <h2 id="tools-title">With Claude</h2>
        <Segmented<Mode>
          aria-label="Tool"
          value={mode}
          onChange={(next) => {
            setMode(next);
            task.setAnswer(null);
          }}
          options={(Object.keys(MODES) as Mode[]).map((key) => ({ value: key, label: MODES[key].label }))}
        />
        {settings.needsAudience && (
          <label className="field">
            For
            <Select
              aria-label="Audience"
              value={audienceKey}
              onChange={setAudienceKey}
              options={audiences.map((entry) => ({ value: entry.key, label: entry.audience.label }))}
            />
          </label>
        )}
        <label className="field">
          Text
          <Input.TextArea aria-label="Text for Claude" value={text} autoSize={{ minRows: 8, maxRows: 20 }} placeholder={settings.placeholder} onChange={(event) => setText(event.target.value)} />
        </label>
        <div className="note-actions">
          <span className="muted small">Checked for patient and customer details, and kept in the log under Settings.</span>
          <Button type="primary" icon={<Sparkles size={14} aria-hidden="true" />} loading={task.busy} disabled={!text.trim()} onClick={go}>
            {settings.button}
          </Button>
        </div>
      </GlassCard>
      <GlassCard className="job-form" aria-labelledby="tools-answer">
        <h2 id="tools-answer">Answer</h2>
        {task.error && <Alert type="error" showIcon title={task.error} />}
        {task.answer ? (
          <>
            <div className="run-output" tabIndex={0}>
              {task.answer}
            </div>
            <div className="note-actions">
              <Button
                icon={<Copy size={14} aria-hidden="true" />}
                onClick={() =>
                  void navigator.clipboard.writeText(task.answer!).then(() => {
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  })
                }
              >
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
          </>
        ) : (
          <p className="muted small">The answer appears here. Read it before you use it: Claude can be wrong.</p>
        )}
      </GlassCard>
    </div>
  );
}
