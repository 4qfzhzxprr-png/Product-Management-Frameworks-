import { Alert, Button, Checkbox, Input, Modal, Select } from "antd";
import { Sparkles, UserPlus } from "lucide-react";
import { useMemo, useState } from "react";
import { KIND_LABELS, type Person } from "../core/models";
import {
  ACTION_KINDS,
  MEETING_SYSTEM,
  meetingPrompt,
  parseProposals,
  proposeByRules,
  toCaptures,
  type ProposedAction,
} from "../core/meetingNotes";
import type { CaptureStore } from "../core/store";
import { useToast } from "./Toast";
import type { Agents } from "./useAgents";
import { useSensitiveGuard } from "./useSensitiveGuard";
import { message } from "./useStore";

interface Row extends ProposedAction {
  keep: boolean;
}

/** Paste notes, let Claude (or the simple rules) find the follow-ups, keep the right ones. */
export function MeetingNotesDialog({
  store,
  people,
  ask,
  initialPersonId,
  onClose,
  onSaved,
}: {
  store: CaptureStore;
  people: Person[];
  ask: Agents["ask"];
  initialPersonId: number | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const toast = useToast();
  const [guard, guardHolder] = useSensitiveGuard();
  const [personId, setPersonId] = useState<number | null>(initialPersonId);
  const [notes, setNotes] = useState("");
  const [keepNotes, setKeepNotes] = useState(true);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [source, setSource] = useState<"claude" | "rules">("claude");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const meetingWith = people.find((person) => person.id === personId) ?? null;
  const kept = rows?.filter((row) => row.keep && row.text.trim()) ?? [];

  async function find(withClaude: boolean) {
    setBusy(true);
    setError(null);
    try {
      const now = Date.now();
      let found: ProposedAction[];
      if (withClaude) {
        const answer = await guard((allowSensitive) =>
          ask({ purpose: "meeting-actions", system: MEETING_SYSTEM, prompt: meetingPrompt(notes, people, now, meetingWith), allowSensitive }),
        );
        if (answer === null) return;
        found = parseProposals(answer, people, meetingWith);
      } else {
        found = proposeByRules(notes, people, now, meetingWith);
      }
      setSource(withClaude ? "claude" : "rules");
      setRows(found.map((action) => ({ ...action, keep: true })));
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusy(false);
    }
  }

  async function addPerson(index: number, name: string) {
    const person = await store.addPerson(name);
    setRows((current) => current!.map((row, at) => (at === index || row.personName === name ? { ...row, personId: person.id, personName: null } : row)));
    await onSaved();
  }

  async function save() {
    setBusy(true);
    try {
      const now = Date.now();
      const ids: number[] = [];
      for (const capture of toCaptures(kept, now)) ids.push((await store.addCapture(capture)).id);
      if (keepNotes && meetingWith) ids.push((await store.addCapture({ body: notes.trim(), kind: "one_on_one", personId: meetingWith.id, at: now })).id);
      await onSaved();
      onClose();
      toast({
        text: `Added ${kept.length} ${kept.length === 1 ? "follow-up" : "follow-ups"}${keepNotes && meetingWith ? " and the notes" : ""}`,
        undo: async () => {
          for (const id of ids) await store.deleteCapture(id);
          await onSaved();
        },
      });
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusy(false);
    }
  }

  const update = (index: number, change: Partial<Row>) => setRows((current) => current!.map((row, at) => (at === index ? { ...row, ...change } : row)));
  const peopleOptions = useMemo(() => [{ value: -1, label: "No one" }, ...people.map((person) => ({ value: person.id, label: person.name }))], [people]);

  return (
    <Modal open title="Meeting notes into actions" width={760} footer={null} onCancel={onClose} className="notes-dialog">
      {guardHolder}
      {rows === null ? (
        <div className="job-form">
          <div className="job-row">
            <label className="field">
              Meeting with (optional)
              <Select
                aria-label="Meeting with"
                allowClear
                placeholder="Anyone, or a group"
                value={personId ?? undefined}
                onChange={(value) => setPersonId(value ?? null)}
                options={people.map((person) => ({ value: person.id, label: person.name }))}
                showSearch
                optionFilterProp="label"
              />
            </label>
          </div>
          <label className="field">
            Notes or transcript
            <Input.TextArea
              aria-label="Notes"
              value={notes}
              autoSize={{ minRows: 8, maxRows: 18 }}
              placeholder="Paste meeting notes or a transcript. Promises, asks, dates and decisions are picked out for you to check."
              onChange={(event) => setNotes(event.target.value)}
            />
          </label>
          {meetingWith && (
            <Checkbox checked={keepNotes} onChange={(event) => setKeepNotes(event.target.checked)}>
              Also keep these notes as a 1:1 note with {meetingWith.name}
            </Checkbox>
          )}
          {error && (
            <Alert
              type="error"
              showIcon
              title={error}
              action={
                <Button size="small" onClick={() => void find(false)}>
                  Use simple rules instead
                </Button>
              }
            />
          )}
          <div className="note-actions">
            <span className="muted small">Claude reads the notes; nothing is saved until you choose what to keep.</span>
            <Button disabled={!notes.trim() || busy} onClick={() => void find(false)}>
              Without Claude
            </Button>
            <Button type="primary" icon={<Sparkles size={14} aria-hidden="true" />} loading={busy} disabled={!notes.trim()} onClick={() => void find(true)}>
              Find actions
            </Button>
          </div>
        </div>
      ) : (
        <div className="job-form">
          <p className="muted small">
            {rows.length === 0
              ? "Nothing to follow up was found in these notes."
              : `${source === "claude" ? "Claude" : "The simple rules"} found ${rows.length}. Untick what you don't want, and fix anything before adding.`}
          </p>
          <ul className="proposal-list">
            {rows.map((row, index) => (
              <li key={index} className={row.keep ? "" : "dropped"}>
                <Checkbox checked={row.keep} aria-label={`Keep: ${row.text}`} onChange={(event) => update(index, { keep: event.target.checked })} />
                <div className="proposal-fields">
                  <Input aria-label="Follow-up" value={row.text} onChange={(event) => update(index, { text: event.target.value })} />
                  <div className="proposal-meta">
                    <Select
                      size="small"
                      aria-label="Kind of follow-up"
                      value={row.kind}
                      onChange={(kind) => update(index, { kind })}
                      options={ACTION_KINDS.map((kind) => ({ value: kind, label: KIND_LABELS[kind] }))}
                    />
                    <Select
                      size="small"
                      aria-label="Person"
                      value={row.personId ?? -1}
                      onChange={(value) => update(index, { personId: value === -1 ? null : value, personName: null })}
                      options={peopleOptions}
                    />
                    {row.kind !== "decision" && (
                      <input
                        type="date"
                        className="ant-input time-input"
                        aria-label="Due"
                        value={row.due}
                        onChange={(event) => update(index, { due: event.target.value })}
                      />
                    )}
                    {row.personName && (
                      <Button size="small" type="link" icon={<UserPlus size={13} aria-hidden="true" />} onClick={() => void addPerson(index, row.personName!)}>
                        Add {row.personName}
                      </Button>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
          {error && <Alert type="error" showIcon title={error} />}
          <div className="note-actions">
            <Button onClick={() => setRows(null)}>Back to the notes</Button>
            <Button type="primary" loading={busy} disabled={kept.length === 0 && !(keepNotes && meetingWith)} onClick={() => void save()}>
              {kept.length === 0 ? "Keep only the notes" : `Add ${kept.length} to captures`}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
