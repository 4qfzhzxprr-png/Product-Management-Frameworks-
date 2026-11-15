import { BarChart3, Inbox, LayoutDashboard, NotebookPen, Plus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { Capture, Person, Project } from "../core/models";
import type { CaptureStore } from "../core/store";
import { isTauri, notifyDataChanged, onDataChanged, setWaitingCount, showCaptureWindow } from "../platform";
import { AnalyticsPage } from "./AnalyticsPage";
import { CaptureForm } from "./CaptureForm";
import { CapturesPage, type Selection } from "./CapturesPage";
import { OverviewPage } from "./OverviewPage";
import { message, useStore } from "./useStore";

type View = "overview" | "analytics" | "captures";

const NAV = [
  { view: "overview", label: "Overview", icon: LayoutDashboard },
  { view: "analytics", label: "Analytics", icon: BarChart3 },
  { view: "captures", label: "Captures", icon: NotebookPen },
] as const;

export function App() {
  const { store, error } = useStore();
  if (error) return <p className="error page-message">{error}</p>;
  if (!store) return null;
  return <Shell store={store} />;
}

/** The app shell: sidebar navigation, the current page, and the data they share. */
function Shell({ store }: { store: CaptureStore }) {
  const [view, setView] = useState<View>("overview");
  const [selection, setSelection] = useState<Selection>({ type: "all" });
  const [people, setPeople] = useState<Person[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [captures, setCaptures] = useState<Capture[]>([]);
  const [waiting, setWaiting] = useState(0);
  const [revision, setRevision] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState<string | null>(null);
  const [inlineCapture, setInlineCapture] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [loadedPeople, loadedProjects, loadedCaptures, count] = await Promise.all([
        store.people(),
        store.projects(),
        store.captures({ limit: 10_000 }),
        store.waitingOnMeCount(),
      ]);
      setPeople(loadedPeople);
      setProjects(loadedProjects);
      setCaptures(loadedCaptures);
      setWaiting(count);
      setNow(Date.now());
      setRevision((value) => value + 1);
      await setWaitingCount(count);
    } catch (cause) {
      setError(message(cause));
    }
  }, [store]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // The capture window saves on its own, then tells this window.
  useEffect(() => onDataChanged(() => void refresh()), [refresh]);

  /** Runs a change, then reloads everything on screen. */
  const change = useCallback(
    async (work: () => Promise<unknown>) => {
      try {
        await work();
        setError(null);
      } catch (cause) {
        setError(message(cause));
      }
      await refresh();
    },
    [refresh],
  );

  async function openCapture() {
    if (!(await showCaptureWindow())) setInlineCapture(true);
  }

  function openCaptures(target: Selection) {
    setSelection(target);
    setView("captures");
  }

  const personName = (id: number | null) => people.find((person) => person.id === id)?.name;

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            <Inbox size={18} />
          </span>
          Daily Work
        </div>

        <nav aria-label="Main">
          {NAV.map(({ view: target, label, icon: Icon }) => (
            <button
              key={target}
              className={view === target ? "nav-item selected" : "nav-item"}
              aria-current={view === target ? "page" : undefined}
              onClick={() => setView(target)}
            >
              <Icon size={18} aria-hidden="true" />
              <span>{label}</span>
              {target === "captures" && waiting > 0 && (
                <span className="nav-badge" aria-label={`${waiting} waiting on you`}>
                  {waiting}
                </span>
              )}
            </button>
          ))}
        </nav>

        <div className="sidebar-foot">
          <button
            className="capture-button"
            aria-label="Quick capture"
            onClick={() => void openCapture()}
            title="Control-Option-Space from anywhere"
          >
            <Plus size={16} aria-hidden="true" />
            <span>Quick capture</span>
          </button>
          <p>{isTauri ? "Stored on this Mac" : "Browser preview with sample data. Nothing is saved."}</p>
        </div>
      </aside>

      <main className="main">
        {error && <p className="error banner">{error}</p>}
        {view === "overview" && (
          <OverviewPage
            captures={captures}
            now={now}
            personName={personName}
            onOpenCaptures={openCaptures}
            onOpenAnalytics={() => setView("analytics")}
            onDone={(capture) =>
              void change(async () => {
                await store.setCaptureDone(capture.id, true);
                await notifyDataChanged();
              })
            }
          />
        )}
        {view === "analytics" && <AnalyticsPage captures={captures} now={now} />}
        {view === "captures" && (
          <CapturesPage
            store={store}
            people={people}
            projects={projects}
            waiting={waiting}
            revision={revision}
            selection={selection}
            onSelect={setSelection}
            change={change}
          />
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
