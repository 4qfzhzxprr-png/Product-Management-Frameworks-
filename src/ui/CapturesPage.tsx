import { Star, X } from "lucide-react";
import { useEffect, useState } from "react";
import { isActionable, KIND_LABELS, type Capture, type CaptureFilter, type Person, type Project } from "../core/models";
import type { CaptureStore } from "../core/store";
import { GlassCard } from "./components";
import { message } from "./useStore";

export type Selection =
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

export function CapturesPage({
  store,
  people,
  projects,
  waiting,
  revision,
  selection,
  onSelect,
  change,
}: {
  store: CaptureStore;
  people: Person[];
  projects: Project[];
  waiting: number;
  /** Changes whenever stored data changes. */
  revision: number;
  selection: Selection;
  onSelect: (selection: Selection) => void;
  change: (work: () => Promise<unknown>) => Promise<void>;
}) {
  const [captures, setCaptures] = useState<Capture[]>([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stale = false;
    store.captures(toFilter(selection, search)).then(
      (loaded) => {
        if (!stale) setCaptures(loaded);
      },
      (cause) => setError(message(cause)),
    );
    return () => {
      stale = true;
    };
  }, [store, selection, search, revision]);

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

  const filterItem = (target: Selection, label: string, badge?: number, actions?: React.ReactNode) => (
    <li key={`${target.type}-${"id" in target ? target.id : ""}`} className="filter-row">
      <button
        className={sameSelection(selection, target) ? "filter-item selected" : "filter-item"}
        aria-current={sameSelection(selection, target) ? "true" : undefined}
        onClick={() => onSelect(target)}
      >
        <span className="filter-label">{label}</span>
        {badge ? <span className="badge">{badge}</span> : null}
      </button>
      {actions}
    </li>
  );

  return (
    <div className="page">
      <header className="page-head with-controls">
        <div>
          <h1>{title}</h1>
          <p>Everything you have captured, newest first.</p>
        </div>
        <input
          type="search"
          placeholder="Search captures"
          aria-label="Search captures"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </header>

      <div className="captures-layout">
        <GlassCard className="filters" aria-label="Filters">
          <h2>Show</h2>
          <ul>
            {filterItem({ type: "all" }, "All")}
            {filterItem({ type: "open" }, "Open", waiting)}
            {filterItem({ type: "wins" }, "Wins")}
          </ul>

          <h2>People</h2>
          <ul>
            {people.map((person) =>
              filterItem(
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
                      if (sameSelection(selection, { type: "person", id: person.id })) onSelect({ type: "all" });
                      void change(() => store.deletePerson(person.id));
                    }}
                  >
                    <X size={14} aria-hidden="true" />
                  </button>
                </span>,
              ),
            )}
          </ul>
          <AddField placeholder="Add person" onAdd={(name) => change(() => store.addPerson(name))} />

          <h2>Projects</h2>
          <ul>
            {projects.map((project) =>
              filterItem(
                { type: "project", id: project.id },
                project.name,
                undefined,
                <span className="row-actions">
                  <button
                    className="icon"
                    title={`Remove ${project.name}`}
                    aria-label={`Remove ${project.name}`}
                    onClick={() => {
                      if (sameSelection(selection, { type: "project", id: project.id })) onSelect({ type: "all" });
                      void change(() => store.deleteProject(project.id));
                    }}
                  >
                    <X size={14} aria-hidden="true" />
                  </button>
                </span>,
              ),
            )}
          </ul>
          <AddField placeholder="Add project" onAdd={(name) => change(() => store.addProject(name))} />
        </GlassCard>

        <GlassCard className="capture-list" index={1} aria-label={title}>
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
                      <Star size={16} aria-hidden="true" fill={capture.isWin ? "currentColor" : "none"} />
                    </button>
                    <button
                      className="icon"
                      title="Delete"
                      aria-label="Delete capture"
                      onClick={() => change(() => store.deleteCapture(capture.id))}
                    >
                      <X size={16} aria-hidden="true" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </GlassCard>
      </div>
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
