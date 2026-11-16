import { Alert, Button, Modal } from "antd";
import { BarChart3, Inbox, LayoutDashboard, ListChecks, NotebookPen, Plus, Sunrise, Users } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { Bucket, SourceItem } from "../core/items";
import type { Capture, CaptureKind, Person, Project } from "../core/models";
import type { CaptureStore } from "../core/store";
import { isTauri, notifyDataChanged, onDataChanged, setWaitingCount, showCaptureWindow } from "../platform";
import { AnalyticsPage } from "./AnalyticsPage";
import { BriefPage } from "./BriefPage";
import { CaptureForm } from "./CaptureForm";
import { CapturesPage, type Selection } from "./CapturesPage";
import { OverviewPage } from "./OverviewPage";
import { QueuePage } from "./QueuePage";
import { TeamPage } from "./TeamPage";
import { message, useStore } from "./useStore";

type View = "overview" | "brief" | "queue" | "team" | "analytics" | "captures";

const NAV = [
  { view: "overview", label: "Overview", icon: LayoutDashboard },
  { view: "brief", label: "Brief", icon: Sunrise },
  { view: "queue", label: "Queue", icon: ListChecks },
  { view: "team", label: "Team", icon: Users },
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
  const [items, setItems] = useState<SourceItem[]>([]);
  // True once anything has ever been synced, including items since dismissed.
  const [connected, setConnected] = useState(false);
  const [revision, setRevision] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState<string | null>(null);
  // Set while the in-window capture dialog is open; holds what the form starts on.
  const [inlineCapture, setInlineCapture] = useState<{
    kind?: CaptureKind;
    personId?: number;
    editing?: Capture;
  } | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [loadedPeople, loadedProjects, loadedCaptures, count, allItems] = await Promise.all([
        store.people(),
        store.projects(),
        store.captures({ limit: 10_000 }),
        store.waitingOnMeCount(),
        store.items.list(),
      ]);
      const openItems = allItems;
      setItems(openItems);
      setConnected(await store.items.hasAny());
      setPeople(loadedPeople);
      setProjects(loadedProjects);
      setCaptures(loadedCaptures);
      setWaiting(count);
      setNow(Date.now());
      setRevision((value) => value + 1);
      // The menu bar counts open captures waiting on David plus synced items needing his decision.
      await setWaitingCount(count + openItems.filter((item) => item.bucket === "decision").length);
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
    if (!(await showCaptureWindow())) setInlineCapture({});
  }

  function openCaptures(target: Selection) {
    setSelection(target);
    setView("captures");
  }

  const personName = (id: number | null) => people.find((person) => person.id === id)?.name;
  const decisions = items.filter((item) => item.bucket === "decision").length;
  const moveItem = (item: SourceItem, bucket: Bucket) => void change(() => store.items.move(item.id, bucket));
  const dismissItem = (item: SourceItem) => void change(() => store.items.dismiss(item.id));

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
              {target === "queue" && decisions > 0 && (
                <span className="nav-badge" aria-label={`${decisions} need your decision`}>
                  {decisions}
                </span>
              )}
              {target === "captures" && waiting > 0 && (
                <span className="nav-badge" aria-label={`${waiting} waiting on you`}>
                  {waiting}
                </span>
              )}
            </button>
          ))}
        </nav>

        <div className="sidebar-foot">
          <Button
            className="capture-button"
            type="primary"
            shape="round"
            size="large"
            block
            icon={<Plus size={16} aria-hidden="true" />}
            aria-label="Quick capture"
            title="Control-Option-Space from anywhere"
            onClick={() => void openCapture()}
          >
            <span className="capture-button-label">Quick capture</span>
          </Button>
          <p>{isTauri ? "Stored on this Mac" : "Browser preview with sample data. Nothing is saved."}</p>
        </div>
      </aside>

      <main className="main glass-panel">
        {error && (
          <Alert className="banner" type="error" showIcon title={error} closable onClose={() => setError(null)} />
        )}
        {view === "overview" && (
          <OverviewPage
            captures={captures}
            now={now}
            personName={personName}
            onOpenCaptures={openCaptures}
            onOpenAnalytics={() => setView("analytics")}
            onCapture={() => void openCapture()}
            onDone={(capture) =>
              void change(async () => {
                await store.setCaptureDone(capture.id, true);
                await notifyDataChanged();
              })
            }
          />
        )}
        {view === "brief" && (
          <BriefPage
            items={items}
            now={now}
            connected={connected}
            onMove={moveItem}
            onDismiss={dismissItem}
            onOpenQueue={() => setView("queue")}
          />
        )}
        {view === "queue" && (
          <QueuePage items={items} now={now} connected={connected} onMove={moveItem} onDismiss={dismissItem} />
        )}
        {view === "team" && (
          <TeamPage
            people={people}
            captures={captures}
            now={now}
            onDone={(capture) => void change(() => store.setCaptureDone(capture.id, true))}
            onCapture={(personId, kind) => setInlineCapture({ personId, kind })}
            onAddPM={(name) =>
              void change(async () => {
                const person = await store.addPerson(name, true);
                if (!person.isPM) await store.setPersonIsPM(person.id, true);
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
            onEdit={(capture) => setInlineCapture({ editing: capture })}
            change={change}
          />
        )}
      </main>

      <Modal
        open={inlineCapture !== null}
        title={inlineCapture?.editing ? "Edit capture" : "Quick capture"}
        footer={null}
        destroyOnHidden
        onCancel={() => setInlineCapture(null)}
      >
        <CaptureForm
          store={store}
          initial={inlineCapture ?? undefined}
          editing={inlineCapture?.editing}
          onSaved={() => {
            setInlineCapture(null);
            void refresh();
          }}
          onCancel={() => setInlineCapture(null)}
        />
      </Modal>
    </div>
  );
}
