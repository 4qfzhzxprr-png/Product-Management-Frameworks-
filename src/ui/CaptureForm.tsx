import { Button, Checkbox, Input } from "antd";
import type { TextAreaRef } from "antd/es/input/TextArea";
import { useEffect, useRef, useState } from "react";
import { CAPTURE_KINDS, KIND_LABELS, type Capture, type CaptureKind, type Person, type Project } from "../core/models";
import type { CaptureStore } from "../core/store";
import { message } from "./useStore";

interface Props {
  store: CaptureStore;
  /** Called after a save. */
  onSaved: () => void;
  onCancel: () => void;
  /** What the form starts on, for a capture opened from a person's card. */
  initial?: { kind?: CaptureKind; personId?: number };
  /** An existing capture to change, instead of adding a new one. */
  editing?: Capture;
}

/** The quick capture form: one line of text, then who and what it is about. */
export function CaptureForm({ store, onSaved, onCancel, initial, editing }: Props) {
  const [body, setBody] = useState(editing?.body ?? "");
  const [kind, setKind] = useState<CaptureKind>(editing?.kind ?? initial?.kind ?? "note");
  const [personId, setPersonId] = useState(String(editing?.personId ?? initial?.personId ?? ""));
  const [projectId, setProjectId] = useState(String(editing?.projectId ?? ""));
  const [isWin, setIsWin] = useState(editing?.isWin ?? false);
  const [people, setPeople] = useState<Person[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [error, setError] = useState<string | null>(null);
  const textRef = useRef<TextAreaRef>(null);

  useEffect(() => {
    textRef.current?.focus();
    Promise.all([store.people(), store.projects()]).then(
      ([loadedPeople, loadedProjects]) => {
        setPeople(loadedPeople);
        setProjects(loadedProjects);
      },
      (cause) => setError(message(cause)),
    );
  }, [store]);

  const canSave = body.trim().length > 0;

  async function save() {
    if (!canSave) return;
    try {
      const values = {
        body,
        kind,
        personId: personId ? Number(personId) : null,
        projectId: projectId ? Number(projectId) : null,
        isWin,
      };
      if (editing) await store.updateCapture(editing.id, values);
      else await store.addCapture(values);
      onSaved();
    } catch (cause) {
      setError(message(cause));
    }
  }

  return (
    <form
      className="capture-form"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") onCancel();
      }}
    >
      <Input.TextArea
        ref={textRef}
        variant="borderless"
        aria-label="Capture text"
        placeholder="Thought, commitment or note"
        autoSize={{ minRows: 3, maxRows: 3 }}
        value={body}
        onChange={(event) => setBody(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            void save();
          }
        }}
      />

      <div className="capture-fields">
        <select aria-label="Kind" value={kind} onChange={(event) => setKind(event.target.value as CaptureKind)}>
          {CAPTURE_KINDS.map((value) => (
            <option key={value} value={value}>
              {KIND_LABELS[value]}
            </option>
          ))}
        </select>
        <select aria-label="Person" value={personId} onChange={(event) => setPersonId(event.target.value)}>
          <option value="">No one</option>
          {people.map((person) => (
            <option key={person.id} value={person.id}>
              {person.name}
            </option>
          ))}
        </select>
        <select aria-label="Project" value={projectId} onChange={(event) => setProjectId(event.target.value)}>
          <option value="">No project</option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </select>
      </div>

      {error && <p className="error">{error}</p>}

      <div className="capture-actions">
        <span title="Wins are collected for later updates and decks">
          <Checkbox checked={isWin} onChange={(event) => setIsWin(event.target.checked)}>
            Win
          </Checkbox>
        </span>
        <span className="hint">Return to save, Esc to cancel</span>
        <Button type="primary" htmlType="submit" disabled={!canSave}>
          Save
        </Button>
      </div>
    </form>
  );
}
