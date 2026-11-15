import { Badge, Button, Checkbox, Empty, Input, Tag } from "antd";
import { Search, Star, X } from "lucide-react";
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
        {badge ? <Badge count={badge} color="var(--accent)" /> : null}
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
        <Input
          className="search"
          allowClear
          prefix={<Search size={15} aria-hidden="true" />}
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
                  <span title={person.isPM ? "One of my PMs. Click to unmark." : "Mark as one of my PMs"}>
                    <Tag.CheckableTag
                      checked={person.isPM}
                      onChange={(checked) => change(() => store.setPersonIsPM(person.id, checked))}
                    >
                      PM
                    </Tag.CheckableTag>
                  </span>
                  <Button
                    type="text"
                    size="small"
                    shape="circle"
                    icon={<X size={14} aria-hidden="true" />}
                    title={`Remove ${person.name}`}
                    aria-label={`Remove ${person.name}`}
                    onClick={() => {
                      if (sameSelection(selection, { type: "person", id: person.id })) onSelect({ type: "all" });
                      void change(() => store.deletePerson(person.id));
                    }}
                  />
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
                  <Button
                    type="text"
                    size="small"
                    shape="circle"
                    icon={<X size={14} aria-hidden="true" />}
                    title={`Remove ${project.name}`}
                    aria-label={`Remove ${project.name}`}
                    onClick={() => {
                      if (sameSelection(selection, { type: "project", id: project.id })) onSelect({ type: "all" });
                      void change(() => store.deleteProject(project.id));
                    }}
                  />
                </span>,
              ),
            )}
          </ul>
          <AddField placeholder="Add project" onAdd={(name) => change(() => store.addProject(name))} />
        </GlassCard>

        <GlassCard className="capture-list" index={1} aria-label={title}>
          {error && <p className="error">{error}</p>}
          {captures.length === 0 ? (
            <Empty
              className="empty"
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={
                search ? "No matches" : "Nothing here yet. Press Control-Option-Space anywhere to capture a note."
              }
            />
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
                      <Checkbox
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
                    <Button
                      type="text"
                      shape="circle"
                      className={capture.isWin ? "star on" : "star"}
                      icon={<Star size={16} aria-hidden="true" fill={capture.isWin ? "currentColor" : "none"} />}
                      title={capture.isWin ? "Remove from wins" : "Mark as a win"}
                      aria-label={capture.isWin ? "Remove from wins" : "Mark as a win"}
                      aria-pressed={capture.isWin}
                      onClick={() => change(() => store.setCaptureWin(capture.id, !capture.isWin))}
                    />
                    <Button
                      type="text"
                      shape="circle"
                      icon={<X size={16} aria-hidden="true" />}
                      title="Delete"
                      aria-label="Delete capture"
                      onClick={() => change(() => store.deleteCapture(capture.id))}
                    />
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
      <Input
        placeholder={placeholder}
        aria-label={placeholder}
        value={value}
        onChange={(event) => setValue(event.target.value)}
      />
    </form>
  );
}
