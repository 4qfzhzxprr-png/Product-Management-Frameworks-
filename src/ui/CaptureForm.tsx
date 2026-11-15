import { useEffect, useRef, useState } from "react";
import { CAPTURE_KINDS, KIND_LABELS, type CaptureKind, type Person, type Project } from "../core/models";
import type { CaptureStore } from "../core/store";
import { message } from "./useStore";

interface Props {
  store: CaptureStore;
  /** Called after a save. */
  onSaved: () => void;
  onCancel: () => void;
}

/** The quick capture form: one line of text, then who and what it is about. */
export function CaptureForm({ store, onSaved, onCancel }: Props) {
  const [body, setBody] = useState("");
  const [kind, setKind] = useState<CaptureKind>("note");
  const [personId, setPersonId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [isWin, setIsWin] = useState(false);
  const [people, setPeople] = useState<Person[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [error, setError] = useState<string | null>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

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
      await store.addCapture({
        body,
        kind,
        personId: personId ? Number(personId) : null,
        projectId: projectId ? Number(projectId) : null,
        isWin,
      });
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
      <textarea
        ref={textRef}
        aria-label="Capture text"
        placeholder="Thought, commitment or note"
        rows={3}
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
        <label title="Wins are collected for later updates and decks">
          <input type="checkbox" checked={isWin} onChange={(event) => setIsWin(event.target.checked)} /> Win
        </label>
        <span className="hint">Return to save, Esc to cancel</span>
        <button type="submit" className="primary" disabled={!canSave}>
          Save
        </button>
      </div>
    </form>
  );
}
