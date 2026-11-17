import { Alert, Button, Modal } from "antd";
import {
  BarChart3,
  Handshake,
  Send,
  Bot,
  Inbox,
  Keyboard,
  Landmark,
  LayoutDashboard,
  ListChecks,
  Megaphone,
  Plug,
  Settings,
  NotebookPen,
  Plus,
  Sunrise,
  Truck,
  Users,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { CalendarEvent } from "../core/calendar";
import type { Connection } from "../core/connectors";
import type { Preread, StakeholderProfile } from "../core/influence";
import { dayStart } from "../core/insights";
import { BUCKET_LABELS, type Bucket, type SourceItem } from "../core/items";
import { noSurprises, roadmapStatus, type Priority, type RoadmapItem } from "../core/leadership";
import { KIND_LABELS, type Capture, type CaptureKind, type Person, type Project } from "../core/models";
import type { CaptureStore } from "../core/store";
import { BACKUP_SETTINGS, completeBackupSettings, isBackupDue, type BackupSettings } from "../core/backup";
import { SETUP_SETTINGS, setupSteps, waitingTotal, type SetupSettings } from "../core/setup";
import type { WorkItem } from "../core/work";
import { isTauri, notifyDataChanged, platformBackups, onDataChanged, setWaitingCount, showCaptureWindow } from "../platform";
import { AgentsPage } from "./AgentsPage";
import { AnalyticsPage } from "./AnalyticsPage";
import { BriefPage } from "./BriefPage";
import { CaptureForm } from "./CaptureForm";
import { CapturesPage, type Selection } from "./CapturesPage";
import { CommitmentsPage } from "./CommitmentsPage";
import { ConnectionsPage } from "./ConnectionsPage";
import { DeliveryPage } from "./DeliveryPage";
import { HandoffPage } from "./HandoffPage";
import { InfluencePage } from "./InfluencePage";
import { LeadershipPage, useLeadershipSettings } from "./LeadershipPage";
import { OneOnOnePage } from "./OneOnOnePage";
import { OverviewPage } from "./OverviewPage";
import { QueuePage } from "./QueuePage";
import { makeBackup, SettingsPage } from "./SettingsPage";
import { Shortcuts } from "./Shortcuts";
import { TeamPage } from "./TeamPage";
import { quote, ToastProvider, useToast } from "./Toast";
import { message, useStore } from "./useStore";
import { NavigateContext } from "./navigation";
import { useAgents } from "./useAgents";
import { registry, useSync } from "./useSync";

type View =
  | "overview"
  | "brief"
  | "queue"
  | "team"
  | "leadership"
  | "influence"
  | "commitments"
  | "delivery"
  | "handoff"
  | "analytics"
  | "captures"
  | "connections"
  | "agents"
  | "settings";

interface NavEntry {
  view: View;
  label: string;
  icon: typeof Plug;
}

const NAV_GROUPS: { heading: string; entries: NavEntry[] }[] = [
  {
    heading: "Today",
    entries: [
      { view: "overview", label: "Overview", icon: LayoutDashboard },
      { view: "brief", label: "Brief", icon: Sunrise },
      { view: "queue", label: "Queue", icon: ListChecks },
      { view: "commitments", label: "Commitments", icon: Handshake },
      { view: "captures", label: "Captures", icon: NotebookPen },
    ],
  },
  {
    heading: "Team",
    entries: [
      { view: "team", label: "Team", icon: Users },
      { view: "agents", label: "Agents", icon: Bot },
      { view: "delivery", label: "Delivery", icon: Truck },
      { view: "handoff", label: "Handoff", icon: Send },
    ],
  },
  {
    heading: "Upward",
    entries: [
      { view: "leadership", label: "Leadership", icon: Landmark },
      { view: "influence", label: "Influence", icon: Megaphone },
      { view: "analytics", label: "Analytics", icon: BarChart3 },
    ],
  },
  {
    heading: "Setup",
    entries: [
      { view: "connections", label: "Connections", icon: Plug },
      { view: "settings", label: "Settings", icon: Settings },
    ],
  },
];

const NAV: NavEntry[] = NAV_GROUPS.flatMap((group) => group.entries);

export function App() {
  const { store, error } = useStore();
  if (error) return <p className="error page-message">{error}</p>;
  if (!store) return null;
  return (
    <ToastProvider>
      <Shell store={store} />
    </ToastProvider>
  );
}

/** The app shell: sidebar navigation, the current page, and the data they share. */
function Shell({ store }: { store: CaptureStore }) {
  const [view, setView] = useState<View>("overview");
  const [selection, setSelection] = useState<Selection>({ type: "all" });
  // The person whose 1:1 workspace is open, and the view it was opened from.
  const [oneOnOne, setOneOnOne] = useState<{ personId: number; from: View } | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [captures, setCaptures] = useState<Capture[]>([]);
  const [waiting, setWaiting] = useState(0);
  const [items, setItems] = useState<SourceItem[]>([]);
  const [work, setWork] = useState<WorkItem[]>([]);
  const [priorities, setPriorities] = useState<Priority[]>([]);
  const [roadmapItems, setRoadmapItems] = useState<RoadmapItem[]>([]);
  const [profiles, setProfiles] = useState<StakeholderProfile[]>([]);
  const [prereads, setPrereads] = useState<Preread[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  // Meetings from connected calendars, from today to two weeks out.
  const [upcoming, setUpcoming] = useState<CalendarEvent[]>([]);
  // True once anything has ever been synced, including items since dismissed.
  const [connected, setConnected] = useState(false);
  const [setupDismissed, setSetupDismissed] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [revision, setRevision] = useState(0);
  // False until the first load finishes, so pages never flash empty counts.
  const [loaded, setLoaded] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  // Set while the in-window capture dialog is open; holds what the form starts on.
  const [inlineCapture, setInlineCapture] = useState<{
    kind?: CaptureKind;
    personId?: number;
    editing?: Capture;
  } | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [
        loadedPeople,
        loadedProjects,
        loadedCaptures,
        count,
        allItems,
        loadedWork,
        loadedPriorities,
        loadedRoadmap,
        loadedProfiles,
        loadedPrereads,
        loadedConnections,
        loadedMeetings,
      ] =
        await Promise.all([
        store.people(),
        store.projects(),
        store.captures({ limit: 10_000 }),
        store.waitingOnMeCount(),
        store.items.list(),
        store.work.list(),
        store.leadership.priorities(),
        store.leadership.roadmap(),
        store.influence.stakeholders(),
        store.influence.prereads(),
        store.connections.list(),
        store.calendar.between(dayStart(Date.now()), dayStart(Date.now(), -14)),
      ]);
      const openItems = allItems;
      setItems(openItems);
      setWork(loadedWork);
      setPriorities(loadedPriorities);
      setRoadmapItems(loadedRoadmap);
      setProfiles(loadedProfiles);
      setPrereads(loadedPrereads);
      setConnections(loadedConnections);
      setUpcoming(loadedMeetings);
      setConnected(await store.items.hasAny());
      setSetupDismissed((await store.settings.get<SetupSettings>(SETUP_SETTINGS))?.dismissed ?? false);
      setPeople(loadedPeople);
      setProjects(loadedProjects);
      setCaptures(loadedCaptures);
      setWaiting(count);
      setNow(Date.now());
      setRevision((value) => value + 1);
      setLoaded(true);
      // The menu bar counts open captures waiting on David plus synced items needing his decision.
      await setWaitingCount(waitingTotal(count, openItems.filter((item) => item.bucket === "decision").length));
    } catch (cause) {
      setError(message(cause));
    }
  }, [store]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const sync = useSync(store, refresh);
  const agents = useAgents(store, () => void refresh());

  // One automatic backup a day, when the app opens. The browser preview saves nothing to back up.
  useEffect(() => {
    if (!loaded || !platformBackups.available) return;
    void (async () => {
      const settings = completeBackupSettings(await store.settings.get<Partial<BackupSettings>>(BACKUP_SETTINGS));
      if (isBackupDue(settings, Date.now())) await makeBackup(store);
    })().catch((cause) => console.warn("Daily backup failed:", cause));
  }, [loaded, store]);

  // Escape leaves the 1:1 workspace, unless a dialog or list is open or a field is being typed in.
  useEffect(() => {
    if (oneOnOne === null) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      if (document.querySelector(".ant-modal-wrap:not([style*='display: none']), .ant-popover:not(.ant-popover-hidden), .ant-select-dropdown:not(.ant-select-dropdown-hidden)")) return;
      setOneOnOne(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [oneOnOne]);

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
  const leadershipSettings = useLeadershipSettings(store, revision);
  const tomorrow = dayStart(now, -1);
  const meetings = upcoming.filter((meeting) => meeting.startsAt < tomorrow);
  const roadmap = roadmapStatus(roadmapItems, work, now);
  const alerts = noSurprises(roadmap);
  const decisions = items.filter((item) => item.bucket === "decision").length;
  const setup = setupSteps({
    connections,
    manual: (connection) => registry.get(connection.connectorId)?.manual === true,
    hasPMs: people.some((person) => person.isPM),
    managerChosen: leadershipSettings?.managerId != null,
    hasCaptures: captures.length > 0,
  });
  const moveItem = (item: SourceItem, bucket: Bucket) =>
    void change(() => store.items.move(item.id, bucket)).then(() =>
      toast({
        text: `Moved ${quote(item.title, 36)} to ${BUCKET_LABELS[bucket]}`,
        undo: () => change(() => store.items.move(item.id, item.bucket)),
      }),
    );
  const dismissItem = (item: SourceItem) =>
    void change(() => store.items.dismiss(item.id)).then(() =>
      toast({ text: `Cleared ${quote(item.title, 40)}`, undo: () => change(() => store.items.restore(item.id)) }),
    );
  /** Marks a capture done or open again; marking done can be undone from the toast. */
  const setDone = (capture: Capture, done = true) =>
    void change(async () => {
      await store.setCaptureDone(capture.id, done);
      await notifyDataChanged();
    }).then(() => {
      if (done)
        toast({
          text: `Done: ${quote(capture.body)}`,
          undo: () =>
            change(async () => {
              await store.setCaptureDone(capture.id, false);
              await notifyDataChanged();
            }),
        });
    });
  const removeCapture = (capture: Capture) =>
    void change(async () => {
      await store.deleteCapture(capture.id);
      await notifyDataChanged();
    }).then(() =>
      toast({
        text: `Deleted ${quote(capture.body)}`,
        undo: () =>
          change(async () => {
            await store.restoreCapture(capture);
            await notifyDataChanged();
          }),
      }),
    );

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
          {NAV_GROUPS.map((group) => (
            <div key={group.heading} className="nav-group" role="group" aria-label={group.heading}>
              <p className="nav-heading" aria-hidden="true">
                {group.heading}
              </p>
              {group.entries.map(({ view: target, label, icon: Icon }) => (
                <button
                  key={target}
                  className={view === target ? "nav-item selected" : "nav-item"}
                  aria-current={view === target ? "page" : undefined}
                  onClick={() => {
                    setView(target);
                    setOneOnOne(null);
                  }}
                >
                  <Icon size={18} aria-hidden="true" />
                  <span>{label}</span>
                  {target === "leadership" && alerts.length > 0 && (
                    <span className="nav-badge" aria-label={`${alerts.length} leadership commitments slipping`}>
                      {alerts.length}
                    </span>
                  )}
                  {target === "queue" && decisions > 0 && (
                    <span className="nav-badge" aria-label={`${decisions} need your decision`}>
                      {decisions}
                    </span>
                  )}
                  {target === "agents" && agents.waiting > 0 && (
                    <span className="nav-badge" aria-label={`${agents.waiting} agent runs to review`}>
                      {agents.waiting}
                    </span>
                  )}
                  {target === "captures" && waiting > 0 && (
                    <span className="nav-badge" aria-label={`${waiting} waiting on you`}>
                      {waiting}
                    </span>
                  )}
                </button>
              ))}
            </div>
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
          <button type="button" className="shortcuts-link" onClick={() => setShortcutsOpen(true)}>
            <Keyboard size={14} aria-hidden="true" />
            Keyboard shortcuts
          </button>
          <p>
            {isTauri
              ? "Stored on this Mac"
              : new URLSearchParams(window.location.search).has("empty")
                ? "Browser preview. Nothing is saved."
                : "Browser preview with sample data. Nothing is saved."}
          </p>
        </div>
      </aside>

      <NavigateContext.Provider
        value={(to) => {
          setOneOnOne(null);
          setView(to);
        }}
      >
        <main className="main glass-panel">
          {error && (
            <Alert className="banner" type="error" showIcon title={error} closable onClose={() => setError(null)} />
          )}
          {loaded && oneOnOne !== null && view === oneOnOne.from && (
            <OneOnOnePage
              upcoming={upcoming}
              personId={oneOnOne.personId}
              people={people}
              captures={captures}
              now={now}
              backLabel={NAV.find((entry) => entry.view === oneOnOne.from)?.label}
              onBack={() => setOneOnOne(null)}
              onAdd={(kind, body) => void change(() => store.addCapture({ kind, body, personId: oneOnOne.personId }))}
              onDone={setDone}
              onDelete={removeCapture}
            />
          )}
          {loaded && oneOnOne === null && view === "overview" && (
            <OverviewPage
              alerts={alerts}
              decisions={decisions}
              onOpenQueue={() => setView("queue")}
              setup={setupDismissed ? null : setup}
              onSetupStep={(step) => {
                if (step === "capture") void openCapture();
                else setView(step === "calendar" || step === "tickets" ? "connections" : step === "team" ? "team" : "leadership");
              }}
              onDismissSetup={() => void change(() => store.settings.set(SETUP_SETTINGS, { dismissed: true } satisfies SetupSettings))}
              onOpenLeadership={() => setView("leadership")}
              captures={captures}
              now={now}
              personName={personName}
              onOpenCaptures={openCaptures}
              onOpenAnalytics={() => setView("analytics")}
              onCapture={() => void openCapture()}
              onDone={(capture) => setDone(capture)}
            />
          )}
          {loaded && oneOnOne === null && view === "brief" && (
            <BriefPage
              meetings={meetings}
              items={items}
              now={now}
              connected={connected}
              onMove={moveItem}
              onDismiss={dismissItem}
              onOpenQueue={() => setView("queue")}
            />
          )}
          {loaded && oneOnOne === null && view === "queue" && (
            <QueuePage items={items} now={now} connected={connected} onMove={moveItem} onDismiss={dismissItem} />
          )}
          {loaded && oneOnOne === null && view === "team" && (
            <TeamPage
              upcoming={upcoming}
              onSetAliases={(personId, aliases) => void change(() => store.setAliases(personId, aliases))}
              work={work}
              onOpen={(personId) => setOneOnOne({ personId, from: "team" })}
              people={people}
              captures={captures}
              now={now}
              onDone={(capture) => setDone(capture)}
              onCapture={(personId, kind) => setInlineCapture({ personId, kind })}
              onAddPM={(name) =>
                void change(async () => {
                  const person = await store.addPerson(name, true);
                  if (!person.isPM) await store.setPersonIsPM(person.id, true);
                })
              }
            />
          )}
          {loaded && oneOnOne === null && view === "leadership" && leadershipSettings && (
            <LeadershipPage
              upcoming={upcoming}
              store={store}
              people={people}
              captures={captures}
              work={work}
              priorities={priorities}
              roadmap={roadmap}
              settings={leadershipSettings}
              now={now}
              change={change}
              onOpenOneOnOne={(personId) => setOneOnOne({ personId, from: "leadership" })}
              onDone={(capture) => setDone(capture)}
              onDelete={removeCapture}
            />
          )}
          {loaded && oneOnOne === null && view === "influence" && (
            <InfluencePage
              store={store}
              people={people}
              projects={projects}
              captures={captures}
              profiles={profiles}
              prereads={prereads}
              now={now}
              change={change}
              onCapture={(personId, kind) => setInlineCapture({ personId, kind })}
              onOpenOneOnOne={(personId) => setOneOnOne({ personId, from: "influence" })}
            />
          )}
          {loaded && oneOnOne === null && view === "commitments" && (
            <CommitmentsPage
              captures={captures}
              now={now}
              personName={personName}
              onDone={(capture) => setDone(capture)}
              onEdit={(capture) => setInlineCapture({ editing: capture })}
            />
          )}
          {loaded && oneOnOne === null && view === "delivery" && <DeliveryPage work={work} now={now} />}
          {loaded && oneOnOne === null && view === "handoff" && (
            <HandoffPage store={store} work={work} captures={captures} meetings={meetings} now={now} />
          )}
          {loaded && oneOnOne === null && view === "connections" && (
            <ConnectionsPage
              store={store}
              connections={connections}
              now={now}
              syncing={sync.syncing}
              lastRun={sync.lastRun}
              reports={sync.reports}
              syncNow={sync.syncNow}
              change={change}
            />
          )}
          {loaded && oneOnOne === null && view === "settings" && <SettingsPage store={store} revision={revision} />}
          {loaded && oneOnOne === null && view === "agents" && (
            <AgentsPage
              agents={agents}
              store={store}
              work={work}
              captures={captures}
              people={people}
              profiles={profiles}
              now={now}
            />
          )}
          {loaded && oneOnOne === null && view === "analytics" && <AnalyticsPage captures={captures} now={now} />}
          {loaded && oneOnOne === null && view === "captures" && (
            <CapturesPage
              store={store}
              people={people}
              projects={projects}
              waiting={waiting}
              revision={revision}
              selection={selection}
              onSelect={setSelection}
              onEdit={(capture) => setInlineCapture({ editing: capture })}
              onDone={setDone}
              onDelete={removeCapture}
              change={change}
            />
          )}
        </main>
      </NavigateContext.Provider>

      <Shortcuts open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
      {/* Rendered only while open, so a quick open and close cannot leave a layer over the page. */}
      {inlineCapture !== null && (
        <Modal
          open
          title={inlineCapture?.editing ? "Edit capture" : "Quick capture"}
          footer={null}
          onCancel={() => setInlineCapture(null)}
        >
          <CaptureForm
            store={store}
            initial={inlineCapture ?? undefined}
            editing={inlineCapture?.editing}
            onSaved={(saved) => {
              const before = inlineCapture?.editing;
              setInlineCapture(null);
              void refresh().then(() =>
                toast(
                  before
                    ? { text: `Saved ${quote(saved.body)}`, undo: () => change(() => store.updateCapture(before.id, before)) }
                    : {
                        text: `Captured ${quote(saved.body)} as ${KIND_LABELS[saved.kind].toLowerCase()}`,
                        undo: () => change(() => store.deleteCapture(saved.id)),
                      },
                ),
              );
            }}
            onCancel={() => setInlineCapture(null)}
          />
        </Modal>
      )}
    </div>
  );
}
