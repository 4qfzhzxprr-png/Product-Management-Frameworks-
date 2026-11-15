import { useCallback, useEffect, useState } from "react";
import { isActionable, KIND_LABELS, type Capture, type CaptureFilter, type Person, type Project } from "../core/models";
import type { CaptureStore } from "../core/store";
import { isTauri, notifyDataChanged, onDataChanged, setWaitingCount, showCaptureWindow } from "../platform";
import { CaptureForm } from "./CaptureForm";
import { message, useStore } from "./useStore";

type Selection =
  | { type: "all" }
  | { type: "open" }
  | { type: "wins" }
  | { type: "person"; id: number }
  | { type: "project"; id: number };

function sameSelection(a: Selection, b: Selection): boolean {
  return a.type === b.type && ("id" in a ? a.id : 0) === ("id" in b ? b.id : 0);
}

function toFilter(selection: Selection, search: string): CaptureFilter {
  switch (selection.type) {
    case "all":
      return { search };
    case "open":
      return { search, openOnly: true };
    case "wins":
      return { search, winsOnly: true };
    case "person":
      return { search, personId: selection.id };
    case "project":
      return { search, projectId: selection.id };
  }
}

export function MainWindow() {
  const { store, error } = useStore();
  if (error) return <p className="error page-message">{error}</p>;
  if (!store) return null;
  return <Main store={store} />;
}

function Main({ store }: { store: CaptureStore }) {
  const [people, setPeople] = useState<Person[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [captures, setCaptures] = useState<Capture[]>([]);
  const [waiting, setWaiting] = useState(0);
  const [selection, setSelection] = useState<Selection>({ type: "all" });
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [inlineCapture, setInlineCapture] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [loadedPeople, loadedProjects, loadedCaptures, count] = await Promise.all([
        store.people(),
        store.projects(),
        store.captures(toFilter(selection, search)),
        store.waitingOnMeCount(),
      ]);
      setPeople(loadedPeople);
      setProjects(loadedProjects);
      setCaptures(loadedCaptures);
      setWaiting(count);
      await setWaitingCount(count);
    } catch (cause) {
      setError(message(cause));
    }
  }, [store, selection, search]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // The capture window saves on its own, then tells this window.
  useEffect(() => onDataChanged(() => void refresh()), [refresh]);

  /** Runs a change, then reloads everything on screen. */
  async function change(work: () => Promise<unknown>) {
    try {
      await work();
      setError(null);
    } catch (cause) {
      setError(message(cause));
    }
    await refresh();
    void notifyDataChanged();
  }

  async function openCapture() {
    if (!(await showCaptureWindow())) setInlineCapture(true);
  }

  const personName = (id: number | null) => people.find((person) => person.id === id)?.name;
  const projectName = (id: number | null) => projects.find((project) => project.id === id)?.name;

  const title =
    selection.type === "all"
      ? "All captures"
      : selection.type === "open"
        ? "Open"
        : selection.type === "wins"
          ? "Wins"
          : selection.type === "person"
            ? (personName(selection.id) ?? "Person")
            : (projectName(selection.id) ?? "Project");

  const navItem = (target: Selection, label: string, badge?: number, actions?: React.ReactNode) => (
    <li key={`${target.type}-${"id" in target ? target.id : ""}`} className="nav-row">
      <button
        className={sameSelection(selection, target) ? "nav-item selected" : "nav-item"}
        onClick={() => setSelection(target)}
      >
        <span className="nav-label">{label}</span>
        {badge ? <span className="badge">{badge}</span> : null}
      </button>
      {actions}
    </li>
  );

  return (
    <div className="app">
      <nav className="sidebar" aria-label="Sections">
        <h2>Captures</h2>
        <ul>
          {navItem({ type: "all" }, "All")}
          {navItem({ type: "open" }, "Open", waiting)}
          {navItem({ type: "wins" }, "Wins")}
        </ul>

        <h2>People</h2>
        <ul>
          {people.map((person) =>
            navItem(
              { type: "person", id: person.id },
              person.name,
              undefined,
              <span className="row-actions">
                <button
                  className={person.isPM ? "chip on" : "chip"}
                  title={person.isPM ? "One of my PMs. Click to unmark." : "Mark as one of my PMs"}
                  aria-pressed={person.isPM}
                  onClick={() => change(() => store.setPersonIsPM(person.id, !person.isPM))}
                >
                  PM
                </button>
                <button
                  className="icon"
                  title={`Remove ${person.name}`}
                  aria-label={`Remove ${person.name}`}
                  onClick={() => {
                    if (sameSelection(selection, { type: "person", id: person.id })) setSelection({ type: "all" });
                    void change(() => store.deletePerson(person.id));
                  }}
                >
                  ×
                </button>
              </span>,
            ),
          )}
        </ul>
        <AddField placeholder="Add person" onAdd={(name) => change(() => store.addPerson(name))} />

        <h2>Projects</h2>
        <ul>
          {projects.map((project) =>
            navItem(
              { type: "project", id: project.id },
              project.name,
              undefined,
              <span className="row-actions">
                <button
                  className="icon"
                  title={`Remove ${project.name}`}
                  aria-label={`Remove ${project.name}`}
                  onClick={() => {
                    if (sameSelection(selection, { type: "project", id: project.id })) setSelection({ type: "all" });
                    void change(() => store.deleteProject(project.id));
                  }}
                >
                  ×
                </button>
              </span>,
            ),
          )}
        </ul>
        <AddField placeholder="Add project" onAdd={(name) => change(() => store.addProject(name))} />
      </nav>

      <main className="content">
        <header className="toolbar">
          <h1>{title}</h1>
          <input
            type="search"
            placeholder="Search captures"
            aria-label="Search captures"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <button className="primary" onClick={() => void openCapture()} title="Control-Option-Space from anywhere">
            Quick capture
          </button>
        </header>

        {!isTauri && <p className="notice">Browser preview: nothing is saved. The Mac app stores data locally.</p>}
        {error && <p className="error">{error}</p>}

        {captures.length === 0 ? (
          <div className="empty">
            <p className="empty-title">{search ? "No matches" : "Nothing here yet"}</p>
            <p>Press Control-Option-Space anywhere to capture a note.</p>
          </div>
        ) : (
          <ul className="captures">
            {captures.map((capture) => {
              const done = capture.doneAt !== null;
              const detail = [
                KIND_LABELS[capture.kind],
                personName(capture.personId),
                projectName(capture.projectId),
                new Date(capture.createdAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }),
              ].filter(Boolean);
              return (
                <li key={capture.id} className={done ? "capture done" : "capture"}>
                  {isActionable(capture.kind) ? (
                    <input
                      type="checkbox"
                      checked={done}
                      aria-label={done ? "Mark not done" : "Mark done"}
                      onChange={() => change(() => store.setCaptureDone(capture.id, !done))}
                    />
                  ) : (
                    <span className="no-check" />
                  )}
                  <div className="capture-text">
                    <p className="capture-body">{capture.body}</p>
                    <p className="capture-detail">{detail.join(" · ")}</p>
                  </div>
                  <button
                    className={capture.isWin ? "icon star on" : "icon star"}
                    title={capture.isWin ? "Remove from wins" : "Mark as a win"}
                    aria-label={capture.isWin ? "Remove from wins" : "Mark as a win"}
                    aria-pressed={capture.isWin}
                    onClick={() => change(() => store.setCaptureWin(capture.id, !capture.isWin))}
                  >
                    {capture.isWin ? "★" : "☆"}
                  </button>
                  <button
                    className="icon"
                    title="Delete"
                    aria-label="Delete capture"
                    onClick={() => change(() => store.deleteCapture(capture.id))}
                  >
                    ×
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </main>

      {inlineCapture && (
        <div className="overlay" onClick={() => setInlineCapture(false)}>
          <div className="dialog" role="dialog" aria-label="Quick capture" onClick={(event) => event.stopPropagation()}>
            <CaptureForm
              store={store}
              onSaved={() => {
                setInlineCapture(false);
                void refresh();
              }}
              onCancel={() => setInlineCapture(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function AddField({ placeholder, onAdd }: { placeholder: string; onAdd: (name: string) => Promise<void> }) {
  const [value, setValue] = useState("");
  return (
    <form
      className="add-field"
      onSubmit={(event) => {
        event.preventDefault();
        if (!value.trim()) return;
        void onAdd(value);
        setValue("");
      }}
    >
      <input
        placeholder={placeholder}
        aria-label={placeholder}
        value={value}
        onChange={(event) => setValue(event.target.value)}
      />
    </form>
  );
}
