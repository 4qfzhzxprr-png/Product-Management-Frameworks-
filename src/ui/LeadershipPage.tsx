import { Button, Checkbox, Input, Popconfirm, Progress, Segmented, Select, Tag } from "antd";
import { ArrowDown, ArrowUp, ArrowUpRight, Copy, Pencil, RotateCcw, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { dateInputFromDue, dueFromDateInput } from "../core/commitments";
import {
  completeFormat,
  draftWeeklyUpdate,
  LEADERSHIP_SETTINGS,
  noSurprises,
  priorityMap,
  ROADMAP_LABELS,
  SECTION_HELP,
  shippedBetween,
  sinceLast,
  weekStart,
  type EpicLink,
  type LeadershipSettings,
  type Priority,
  type RoadmapItem,
  type RoadmapStatus,
  type UpdateFormat,
} from "../core/leadership";
import type { CalendarEventRecord } from "../core/calendar";
import type { Capture, CaptureKind, Person } from "../core/models";
import type { CaptureStore } from "../core/store";
import { personCard } from "../core/team";
import { epicHealth, HEALTH_LABELS, type EpicHealth, type WorkItem } from "../core/work";
import { openExternal } from "../platform";
import { useNavigate } from "./navigation";
import { GlassCard, NextMeeting } from "./components";
import { AddLine, Checklist } from "./OneOnOnePage";
import { message } from "./useStore";

type Tab = "update" | "prep" | "roadmap" | "priorities" | "shipped";

const TABS: { value: Tab; label: string }[] = [
  { value: "update", label: "Weekly update" },
  { value: "prep", label: "1:1 prep" },
  { value: "roadmap", label: "Roadmap" },
  { value: "priorities", label: "Priorities" },
  { value: "shipped", label: "Shipped" },
];

function shortDate(time: number): string {
  return new Date(time).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function age(time: number, now: number): string {
  const days = Math.floor((now - time) / 86_400_000);
  return days === 0 ? "today" : days === 1 ? "1 day ago" : `${days} days ago`;
}

interface Props {
  store: CaptureStore;
  people: Person[];
  captures: Capture[];
  work: WorkItem[];
  priorities: Priority[];
  roadmap: RoadmapStatus[];
  settings: LeadershipSettings;
  now: number;
  /** Runs a change, then reloads everything on screen. */
  change: (work: () => Promise<unknown>) => Promise<void>;
  onOpenOneOnOne: (personId: number) => void;
  /** Marks a capture done, with undo. */
  onDone: (capture: Capture) => void;
  /** Deletes a capture, with undo. */
  onDelete: (capture: Capture) => void;
  /** Meetings from connected calendars, for the next meeting with the CPO. */
  upcoming: CalendarEventRecord[];
}

/** The CPO features: the weekly update, 1:1 prep, the roadmap given to leadership, priorities, and what shipped. */
export function LeadershipPage(props: Props) {
  const [tab, setTab] = useState<Tab>("update");
  const alerts = noSurprises(props.roadmap);

  return (
    <div className="page">
      <header className="page-head with-controls">
        <div>
          <h1>Leadership</h1>
          <p>What the CPO should hear from you: the weekly update, your 1:1, and the dates you gave leadership.</p>
        </div>
        <Segmented<Tab> aria-label="Section" value={tab} onChange={setTab} options={TABS} />
      </header>

      {/* In full on the weekly update; one line elsewhere. The roadmap and 1:1 prep already list each slip. */}
      {alerts.length > 0 && (tab === "priorities" || tab === "shipped") && (
        <section className="slip-banner" aria-label="Leadership commitments slipping">
          <p>
            <strong>
              {alerts.length} {alerts.length === 1 ? "commitment to leadership is" : "commitments to leadership are"} slipping:
            </strong>{" "}
            {alerts.map((status) => status.item.title).join(", ")}.
          </p>
          <Button onClick={() => setTab("roadmap")}>Open the roadmap</Button>
        </section>
      )}
      {alerts.length > 0 && tab === "update" && (
        <GlassCard className="alerts" aria-labelledby="alerts-title">
          <h2 id="alerts-title">
            Tell the CPO before they hear it elsewhere <span className="count">{alerts.length}</span>
          </h2>
          <ul className="items">
            {alerts.map((status) => (
              <li key={status.item.id} className="item">
                <div className="item-text">
                  <p className="item-meta">
                    <Tag className={`roadmap-state ${status.state}`} variant="filled">
                      {ROADMAP_LABELS[status.state]}
                    </Tag>
                    <span>{status.item.committedAt ? `Promised for ${shortDate(status.item.committedAt)}` : "No date"}</span>
                  </p>
                  <p className="alert-title">{status.item.title}</p>
                  <p className="item-snippet">{status.reasons.join(" ")}</p>
                </div>
              </li>
            ))}
          </ul>
          <Button type="link" className="see-all" onClick={() => setTab("roadmap")}>
            Open the roadmap
          </Button>
        </GlassCard>
      )}

      {tab === "update" && <WeeklyUpdate {...props} />}
      {tab === "prep" && <OneOnOnePrep {...props} />}
      {tab === "roadmap" && <Roadmap {...props} />}
      {tab === "priorities" && <Priorities {...props} />}
      {tab === "shipped" && <ShippedLog work={props.work} now={props.now} />}
    </div>
  );
}

// ---------- Weekly update ----------

function WeeklyUpdate({ store, captures, work, roadmap, settings, now, change }: Props) {
  const [format, setFormat] = useState<UpdateFormat>(settings.format);
  const [note, setNote] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const draft = useMemo(
    () => draftWeeklyUpdate({ work, captures, roadmap, managerId: settings.managerId, now, format }),
    [work, captures, roadmap, settings.managerId, now, format],
  );

  function save(next: UpdateFormat) {
    setFormat(next);
    // Saved through change() so the rest of the app sees the new format.
    void change(() => store.settings.set(LEADERSHIP_SETTINGS, { ...settings, format: next })).catch((cause) =>
      setError(message(cause)),
    );
  }

  function updateSection(index: number, change: Partial<UpdateFormat["sections"][number]>) {
    save({ ...format, sections: format.sections.map((section, at) => (at === index ? { ...section, ...change } : section)) });
  }

  function moveSection(index: number, direction: -1 | 1) {
    const sections = [...format.sections];
    const target = index + direction;
    if (target < 0 || target >= sections.length) return;
    [sections[index], sections[target]] = [sections[target], sections[index]];
    save({ ...format, sections });
  }

  return (
    <div className="update-grid">
      <GlassCard className="workspace-card" index={0} aria-labelledby="format-title">
        <h2 id="format-title">Format</h2>
        <p className="muted small">
          Match the CPO's preferred format: rename, reorder or switch off sections. Saved for next week.
        </p>
        {error && <p className="error">{error}</p>}
        <label className="field">
          First line
          <Input value={format.title} onChange={(event) => save({ ...format, title: event.target.value })} />
          <span className="muted small">{"{date}"} becomes the Monday of this week.</span>
        </label>
        <ul className="format-list">
          {format.sections.map((section, index) => (
            <li key={section.id}>
              <Checkbox
                checked={section.on}
                aria-label={`Include ${section.heading}`}
                onChange={(event) => updateSection(index, { on: event.target.checked })}
              />
              <div>
                <Input
                  size="small"
                  aria-label={`Heading for ${SECTION_HELP[section.id]}`}
                  value={section.heading}
                  disabled={!section.on}
                  onChange={(event) => updateSection(index, { heading: event.target.value })}
                />
                <p className="muted small">{SECTION_HELP[section.id]}</p>
              </div>
              <span className="order">
                <Button
                  type="text"
                  size="small"
                  icon={<ArrowUp size={14} aria-hidden="true" />}
                  aria-label={`Move ${section.heading} up`}
                  disabled={index === 0}
                  onClick={() => moveSection(index, -1)}
                />
                <Button
                  type="text"
                  size="small"
                  icon={<ArrowDown size={14} aria-hidden="true" />}
                  aria-label={`Move ${section.heading} down`}
                  disabled={index === format.sections.length - 1}
                  onClick={() => moveSection(index, 1)}
                />
              </span>
            </li>
          ))}
        </ul>
      </GlassCard>

      <GlassCard className="workspace-card" index={1} aria-labelledby="draft-title">
        <h2 id="draft-title">Draft</h2>
        <p className="muted small">
          Built by rules from what is stored: shipped tickets, captured wins and decisions, roadmap risks and asks. Edit
          it, copy it, and send it yourself.
        </p>
        <Input.TextArea
          aria-label="Draft weekly update"
          autoSize={{ minRows: 16, maxRows: 30 }}
          value={note ?? draft}
          onChange={(event) => setNote(event.target.value)}
        />
        <div className="note-actions">
          {note !== null && note !== draft && (
            <Button icon={<RotateCcw size={14} aria-hidden="true" />} onClick={() => setNote(null)}>
              Start over
            </Button>
          )}
          <Button
            type="primary"
            icon={<Copy size={14} aria-hidden="true" />}
            onClick={() =>
              navigator.clipboard.writeText(note ?? draft).then(
                () => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                },
                () => setError("Could not copy. Select the text and copy it by hand."),
              )
            }
          >
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
      </GlassCard>
    </div>
  );
}

// ---------- 1:1 prep ----------

function OneOnOnePrep({ store, people, captures, work, roadmap, settings, now, change, onOpenOneOnOne, upcoming, onDone, onDelete }: Props) {
  const manager = people.find((person) => person.id === settings.managerId) ?? null;
  const [choosing, setChoosing] = useState(false);

  const setManager = (managerId: number | null) =>
    change(() => store.settings.set(LEADERSHIP_SETTINGS, { ...settings, managerId }));

  if (!manager || choosing) {
    return (
      <GlassCard className="team-empty" aria-labelledby="who-title">
        <h2 id="who-title">Who do you report to?</h2>
        <p className="muted">Their agenda, what you owe each other and what changed since your last 1:1 appear here.</p>
        <Select
          showSearch
          aria-label="The person you report to"
          placeholder="Choose a person"
          value={manager?.id}
          optionFilterProp="label"
          onChange={(id: number) => {
            setChoosing(false);
            void setManager(id);
          }}
          options={people.map((person) => ({ value: person.id, label: person.name }))}
        />
        <AddLine
          placeholder="Or add them by name"
          onAdd={(name) =>
            void change(async () => {
              const person = await store.addPerson(name);
              await store.settings.set(LEADERSHIP_SETTINGS, { ...settings, managerId: person.id });
              setChoosing(false);
            })
          }
        />
      </GlassCard>
    );
  }

  const card = personCard(manager, captures, now);
  const since = sinceLast(card.lastOneOnOne, work, captures, now);
  const alerts = noSurprises(roadmap);
  const add = (kind: CaptureKind) => (body: string) =>
    void change(() => store.addCapture({ kind, body, personId: manager.id }));
  const done = onDone;
  const remove = onDelete;

  return (
    <>
      <div className="prep-head">
        <p>
          Preparing for your 1:1 with <strong>{manager.name}</strong>.{" "}
          {card.lastOneOnOne ? `Last 1:1 note ${age(card.lastOneOnOne.createdAt, now)}.` : "No 1:1 notes yet."}
        </p>
        <Button type="link" onClick={() => setChoosing(true)}>
          Change person
        </Button>
        <Button type="primary" onClick={() => onOpenOneOnOne(manager.id)}>
          Open the full 1:1 workspace
        </Button>
      </div>
      <NextMeeting person={manager} upcoming={upcoming} now={now} />
      <div className="oneonone-grid">
        <GlassCard className="workspace-card" index={0} aria-labelledby="prep-agenda">
          <h2 id="prep-agenda">Agenda</h2>
          <AddLine placeholder="Add a topic" onAdd={add("agenda")} />
          <Checklist
            items={card.agenda}
            empty="Nothing to raise yet."
            doneLabel="Mark discussed"
            onDone={done}
            onDelete={remove}
            detail={(topic) => `Added ${age(topic.createdAt, now)}`}
          />
          {alerts.length > 0 && (
            <div className="pm-section">
              <h3>Slipping commitments to raise</h3>
              <ul className="workspace-list">
                {alerts.map((status) => (
                  <li key={status.item.id}>
                    <div>
                      <p>{status.item.title}</p>
                      <p className="muted small">{status.reasons[0]}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </GlassCard>

        <GlassCard className="workspace-card" index={1} aria-labelledby="prep-owed">
          <h2 id="prep-owed">Commitments</h2>
          <div className="pm-section">
            <h3>
              I owe {manager.name} {card.needsFromMe.length > 0 && <span className="count">{card.needsFromMe.length}</span>}
            </h3>
            <Checklist
              items={card.needsFromMe}
              empty="Nothing open."
              doneLabel="Mark done"
              onDone={done}
              onDelete={remove}
              detail={(item) =>
                `${item.kind === "commitment" ? "I promised" : "They asked"}${item.dueAt ? ` · due ${shortDate(item.dueAt)}` : ""}`
              }
            />
          </div>
          <AddLine placeholder="Something I promised" onAdd={add("commitment")} />
          <div className="pm-section">
            <h3>
              I need from {manager.name}{" "}
              {card.waitingOnThem.length > 0 && <span className="count">{card.waitingOnThem.length}</span>}
            </h3>
            <Checklist
              items={card.waitingOnThem}
              empty="Nothing open."
              doneLabel="Mark done"
              onDone={done}
              onDelete={remove}
              detail={(item) => `Asked ${age(item.createdAt, now)}`}
            />
          </div>
          <AddLine placeholder="Something I need from them" onAdd={add("ask_of_them")} />
        </GlassCard>

        <GlassCard className="workspace-card" index={2} aria-labelledby="prep-since">
          <h2 id="prep-since">{since.since ? "Since your last 1:1" : "In the last week"}</h2>
          <dl className="facts">
            <div>
              <dt>Tickets shipped</dt>
              <dd>{work.length === 0 ? "No tracker connected" : since.shipped}</dd>
            </div>
            <div>
              <dt>Wins</dt>
              <dd>
                {since.wins.length === 0 ? (
                  "None captured"
                ) : (
                  <ul className="fact-list">
                    {since.wins.map((win) => (
                      <li key={win.id}>{win.body}</li>
                    ))}
                  </ul>
                )}
              </dd>
            </div>
            <div>
              <dt>Decisions</dt>
              <dd>
                {since.decisions.length === 0 ? (
                  "None captured"
                ) : (
                  <ul className="fact-list">
                    {since.decisions.map((decision) => (
                      <li key={decision.id}>{decision.body}</li>
                    ))}
                  </ul>
                )}
              </dd>
            </div>
          </dl>
        </GlassCard>
      </div>
    </>
  );
}

// ---------- Epic links, shared by the roadmap and priorities ----------

function EpicLinks({
  links,
  health,
  canLink,
  onLink,
  onUnlink,
}: {
  links: EpicLink[];
  health: EpicHealth[];
  canLink: boolean;
  onLink: (epic: EpicHealth) => void;
  onUnlink: (link: EpicLink) => void;
}) {
  const linked = (entry: EpicHealth) =>
    links.some((link) => link.source === entry.epic.source && link.externalId === entry.epic.externalId);
  const available = health.filter((entry) => !linked(entry));

  return (
    <div className="pm-section">
      <h3>Epics</h3>
      {links.length === 0 ? (
        <p className="muted small">
          {canLink ? "None linked yet." : "No issue tracker is connected yet. Link epics once one is."}
        </p>
      ) : (
        <ul className="epics">
          {links.map((link) => {
            const entry = health.find(
              (candidate) => candidate.epic.source === link.source && candidate.epic.externalId === link.externalId,
            );
            return (
              <li key={`${link.source}/${link.externalId}`}>
                {entry ? (
                  <>
                    <button className="item-title" onClick={() => void openExternal(entry.epic.url)}>
                      {entry.epic.title}
                    </button>
                    <span className="muted small">
                      {entry.done}/{entry.total}
                    </span>
                    <Tag className={`health ${entry.health}`} variant="filled">
                      {HEALTH_LABELS[entry.health]}
                    </Tag>
                  </>
                ) : (
                  <span className="item-title muted">{link.externalId} (no longer in the tracker)</span>
                )}
                <Button
                  type="text"
                  size="small"
                  shape="circle"
                  icon={<X size={14} aria-hidden="true" />}
                  aria-label={`Unlink ${entry?.epic.title ?? link.externalId}`}
                  title="Unlink"
                  onClick={() => onUnlink(link)}
                />
              </li>
            );
          })}
        </ul>
      )}
      {canLink && available.length > 0 && (
        <Select
          className="link-epic"
          showSearch
          size="small"
          aria-label="Link an epic"
          placeholder="Link an epic"
          value={null}
          optionFilterProp="label"
          onChange={(key: string) => {
            const entry = available.find((candidate) => `${candidate.epic.source}/${candidate.epic.externalId}` === key);
            if (entry) onLink(entry);
          }}
          options={available.map((entry) => ({
            value: `${entry.epic.source}/${entry.epic.externalId}`,
            label: `${entry.epic.externalId} ${entry.epic.title}`,
          }))}
        />
      )}
    </div>
  );
}

// ---------- Roadmap ----------

function RoadmapEditor({
  item,
  onSave,
  onCancel,
}: {
  item?: RoadmapItem;
  onSave: (values: { title: string; committedAt: number | null; toLeadership: boolean }) => void;
  onCancel?: () => void;
}) {
  const [title, setTitle] = useState(item?.title ?? "");
  const [date, setDate] = useState(dateInputFromDue(item?.committedAt ?? null));
  const [toLeadership, setToLeadership] = useState(item?.toLeadership ?? true);
  return (
    <form
      className="roadmap-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (!title.trim()) return;
        onSave({ title, committedAt: dueFromDateInput(date), toLeadership });
        if (!item) {
          setTitle("");
          setDate("");
        }
      }}
    >
      <Input
        aria-label="Roadmap item"
        placeholder="Roadmap item, as leadership knows it"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
      />
      <label className="due">
        Promised for
        <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
      </label>
      <Checkbox checked={toLeadership} onChange={(event) => setToLeadership(event.target.checked)}>
        Date given to leadership
      </Checkbox>
      <Button htmlType="submit" type="primary" disabled={!title.trim()}>
        {item ? "Save" : "Add"}
      </Button>
      {onCancel && <Button onClick={onCancel}>Cancel</Button>}
    </form>
  );
}

function Roadmap({ store, work, roadmap, now, change }: Props) {
  const health = useMemo(() => epicHealth(work, now), [work, now]);
  const [editing, setEditing] = useState<number | null>(null);

  return (
    <>
      <GlassCard aria-labelledby="add-roadmap">
        <h2 id="add-roadmap">Add to the roadmap</h2>
        <RoadmapEditor
          onSave={(values) => void change(() => store.leadership.addRoadmapItem(values))}
        />
      </GlassCard>
      {roadmap.length === 0 ? (
        <p className="muted">
          Nothing on the roadmap yet. Add what leadership has been promised, link the epics that deliver it, and the app
          will flag it when it starts to slip.
        </p>
      ) : (
        <div className="team-grid">
          {roadmap.map((status, index) => {
            const { item } = status;
            return (
              <GlassCard key={item.id} className="pm-card" index={index} aria-label={item.title}>
                {editing === item.id ? (
                  <RoadmapEditor
                    item={item}
                    onCancel={() => setEditing(null)}
                    onSave={(values) =>
                      void change(async () => {
                        await store.leadership.updateRoadmapItem(item.id, { ...values, notes: item.notes });
                        setEditing(null);
                      })
                    }
                  />
                ) : (
                  <header className="roadmap-head">
                    <div>
                      <h2>{item.title}</h2>
                      <p className="muted small">
                        {item.committedAt ? `Promised for ${shortDate(item.committedAt)}` : "No date"}
                        {item.toLeadership ? " · given to leadership" : ""}
                      </p>
                    </div>
                    <Tag className={`roadmap-state ${status.state}`} variant="filled">
                      {ROADMAP_LABELS[status.state]}
                    </Tag>
                    <Button
                      type="text"
                      size="small"
                      shape="circle"
                      icon={<Pencil size={14} aria-hidden="true" />}
                      aria-label={`Edit ${item.title}`}
                      onClick={() => setEditing(item.id)}
                    />
                    <Popconfirm
                      title={`Delete ${item.title}?`}
                      description="Its date and epic links go too."
                      okText="Delete"
                      okButtonProps={{ danger: true }}
                      onConfirm={() => void change(() => store.leadership.deleteRoadmapItem(item.id))}
                    >
                      <Button
                        type="text"
                        size="small"
                        shape="circle"
                        className="danger-hover"
                        icon={<Trash2 size={14} aria-hidden="true" />}
                        aria-label={`Delete ${item.title}`}
                      />
                    </Popconfirm>
                  </header>
                )}
                {status.total > 0 && (
                  <div>
                    <Progress
                      percent={Math.round((status.done / status.total) * 100)}
                      strokeColor="var(--bar)"
                      aria-label={`${status.done} of ${status.total} tickets done`}
                    />
                    <p className="muted small">
                      {status.done} of {status.total} tickets done
                    </p>
                  </div>
                )}
                {status.reasons.length > 0 && (
                  <ul className="reasons">
                    {status.reasons.map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                )}
                <EpicLinks
                  links={item.epics}
                  health={health}
                  canLink={work.length > 0}
                  onLink={(entry) =>
                    void change(() =>
                      store.leadership.linkEpic("roadmap", item.id, entry.epic, entry.total),
                    )
                  }
                  onUnlink={(link) => void change(() => store.leadership.unlinkEpic("roadmap", item.id, link))}
                />
              </GlassCard>
            );
          })}
        </div>
      )}
    </>
  );
}

// ---------- Priorities ----------

function PriorityEditor({ priority, onSave, onCancel }: { priority: Priority; onSave: (values: { title: string; notes: string }) => void; onCancel: () => void }) {
  const [title, setTitle] = useState(priority.title);
  const [notes, setNotes] = useState(priority.notes);
  return (
    <form
      className="note-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (title.trim()) onSave({ title, notes });
      }}
    >
      <Input aria-label="Priority" value={title} onChange={(event) => setTitle(event.target.value)} />
      <Input.TextArea
        aria-label="What the CPO said about it"
        placeholder="What the CPO said about it"
        autoSize={{ minRows: 2, maxRows: 5 }}
        value={notes}
        onChange={(event) => setNotes(event.target.value)}
      />
      <span className="note-actions">
        <Button onClick={onCancel}>Cancel</Button>
        <Button htmlType="submit" type="primary" disabled={!title.trim()}>
          Save
        </Button>
      </span>
    </form>
  );
}

function Priorities({ store, work, priorities, now, change }: Props) {
  const map = useMemo(() => priorityMap(priorities, work, now), [priorities, work, now]);
  const health = useMemo(() => epicHealth(work, now), [work, now]);
  const [editing, setEditing] = useState<number | null>(null);

  return (
    <>
      <GlassCard aria-labelledby="add-priority">
        <h2 id="add-priority">The CPO's priorities</h2>
        <p className="muted small">In the CPO's order. Link the epics that serve each one to see where the team's effort goes.</p>
        <AddLine placeholder="Add a priority" onAdd={(title) => void change(() => store.leadership.addPriority(title))} />
      </GlassCard>

      {map.priorities.length > 0 && (
        <div className="team-grid">
          {map.priorities.map(({ priority, epics }, index) => {
            const counts = (["off_track", "at_risk", "on_track", "not_started", "done"] as const)
              .map((key) => [key, epics.filter((entry) => entry.health === key).length] as const)
              .filter(([, count]) => count > 0);
            return (
              <GlassCard key={priority.id} className="pm-card" index={index} aria-label={priority.title}>
                {editing === priority.id ? (
                  <PriorityEditor
                    priority={priority}
                    onCancel={() => setEditing(null)}
                    onSave={(values) =>
                      void change(async () => {
                        await store.leadership.updatePriority(priority.id, values);
                        setEditing(null);
                      })
                    }
                  />
                ) : (
                  <header className="roadmap-head">
                    <span className="avatar" aria-hidden="true">
                      {index + 1}
                    </span>
                    <div>
                      <h2>{priority.title}</h2>
                      {priority.notes && <p className="muted small">{priority.notes}</p>}
                    </div>
                    <Button
                      type="text"
                      size="small"
                      shape="circle"
                      icon={<ArrowUp size={14} aria-hidden="true" />}
                      aria-label={`Move ${priority.title} up`}
                      disabled={index === 0}
                      onClick={() => void change(() => store.leadership.movePriority(priority.id, -1))}
                    />
                    <Button
                      type="text"
                      size="small"
                      shape="circle"
                      icon={<ArrowDown size={14} aria-hidden="true" />}
                      aria-label={`Move ${priority.title} down`}
                      disabled={index === map.priorities.length - 1}
                      onClick={() => void change(() => store.leadership.movePriority(priority.id, 1))}
                    />
                    <Button
                      type="text"
                      size="small"
                      shape="circle"
                      icon={<Pencil size={14} aria-hidden="true" />}
                      aria-label={`Edit ${priority.title}`}
                      onClick={() => setEditing(priority.id)}
                    />
                    <Popconfirm
                      title={`Delete ${priority.title}?`}
                      description="Its epic links go too."
                      okText="Delete"
                      okButtonProps={{ danger: true }}
                      onConfirm={() => void change(() => store.leadership.deletePriority(priority.id))}
                    >
                      <Button
                        type="text"
                        size="small"
                        shape="circle"
                        className="danger-hover"
                        icon={<Trash2 size={14} aria-hidden="true" />}
                        aria-label={`Delete ${priority.title}`}
                      />
                    </Popconfirm>
                  </header>
                )}
                <p className="muted small">
                  {epics.length === 0
                    ? "No work linked to this priority yet."
                    : counts.map(([key, count]) => `${count} ${HEALTH_LABELS[key].toLowerCase()}`).join(" · ")}
                </p>
                <EpicLinks
                  links={priority.epics}
                  health={health}
                  canLink={work.length > 0}
                  onLink={(entry) =>
                    void change(() => store.leadership.linkEpic("priority", priority.id, entry.epic, entry.total))
                  }
                  onUnlink={(link) => void change(() => store.leadership.unlinkEpic("priority", priority.id, link))}
                />
              </GlassCard>
            );
          })}
        </div>
      )}

      {map.unmapped.length > 0 && (
        <GlassCard className="brief-section" aria-labelledby="unmapped-title">
          <h2 id="unmapped-title">
            Open epics that serve no priority <span className="count">{map.unmapped.length}</span>
          </h2>
          <p className="muted small">Either link them to a priority, or ask whether the work should be happening.</p>
          <ul className="epics">
            {map.unmapped.map((entry) => (
              <li key={entry.epic.id}>
                <button className="item-title" onClick={() => void openExternal(entry.epic.url)}>
                  {entry.epic.title}
                </button>
                <span className="muted small">{entry.epic.ownerName}</span>
                <Tag className={`health ${entry.health}`} variant="filled">
                  {HEALTH_LABELS[entry.health]}
                </Tag>
              </li>
            ))}
          </ul>
        </GlassCard>
      )}
    </>
  );
}

// ---------- Shipped ----------

const WEEKS = [
  { value: 0, label: "This week" },
  { value: 1, label: "Last week" },
  { value: 2, label: "2 weeks ago" },
  { value: 3, label: "3 weeks ago" },
];

function ShippedLog({ work, now }: { work: WorkItem[]; now: number }) {
  const navigate = useNavigate();
  const [weeksAgo, setWeeksAgo] = useState(0);
  const from = weekStart(now, weeksAgo);
  const shipped = shippedBetween(work, from, weekStart(now, weeksAgo - 1));

  if (work.length === 0) {
    return (
      <GlassCard className="team-empty">
        <h2>No tickets synced yet</h2>
        <p className="muted">The shipped log fills from an issue tracker. None is connected yet.</p>
        <Button type="primary" onClick={() => navigate("connections")}>
          Import tickets
        </Button>
      </GlassCard>
    );
  }

  return (
    <GlassCard className="workspace-card" aria-labelledby="shipped-title">
      <div className="chart-head">
        <h2 id="shipped-title">
          Shipped in the week of {shortDate(from)} <span className="count">{shipped.count}</span>
        </h2>
        <Segmented<number> aria-label="Week" value={weeksAgo} onChange={setWeeksAgo} options={WEEKS} />
      </div>
      {shipped.epicsCompleted.length > 0 && (
        <p>
          Epics finished:{" "}
          {shipped.epicsCompleted.map((epic) => (
            <Tag key={epic.id} className="health done" variant="filled">
              {epic.title}
            </Tag>
          ))}
        </p>
      )}
      {shipped.groups.length === 0 ? (
        <p className="muted">Nothing was finished that week.</p>
      ) : (
        shipped.groups.map((group) => (
          <div key={group.epic ? group.epic.id : "none"} className="pm-section">
            <h3>{group.epic ? group.epic.title : "Not under an epic"}</h3>
            <ul className="workspace-list">
              {group.items.map((item) => (
                <li key={item.id}>
                  <div>
                    <button className="item-title" onClick={() => void openExternal(item.url)}>
                      {item.externalId} {item.title} <ArrowUpRight size={13} aria-hidden="true" />
                    </button>
                    <p className="muted small">
                      {[item.team, item.ownerName, item.resolvedAt ? `finished ${shortDate(item.resolvedAt)}` : ""]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))
      )}
    </GlassCard>
  );
}

/** Loads the leadership settings with defaults filled in. */
export function useLeadershipSettings(store: CaptureStore, revision: number): LeadershipSettings | null {
  const [settings, setSettings] = useState<LeadershipSettings | null>(null);
  useEffect(() => {
    let stale = false;
    store.settings.get<Partial<LeadershipSettings>>(LEADERSHIP_SETTINGS).then((saved) => {
      if (!stale) setSettings({ managerId: saved?.managerId ?? null, format: completeFormat(saved?.format) });
    });
    return () => {
      stale = true;
    };
  }, [store, revision]);
  return settings;
}
