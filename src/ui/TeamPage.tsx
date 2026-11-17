import { Button, Checkbox, Input, Popconfirm, Select, Tag } from "antd";
import { Plus, Trash2, Trophy } from "lucide-react";
import { useState } from "react";
import type { CalendarEventRecord } from "../core/calendar";
import type { Capture, CaptureKind, Person } from "../core/models";
import { teamBoard } from "../core/team";
import { daysSincePraise, describeTimeOff, oneOnOneCadence, type TimeOff } from "../core/leading";
import { dueFromDateInput } from "../core/commitments";
import { epicHealth, epicsFor, HEALTH_LABELS, type WorkItem } from "../core/work";
import { openExternal } from "../platform";
import { GlassCard, NextMeeting } from "./components";

function age(time: number, now: number): string {
  const days = Math.floor((now - time) / 86_400_000);
  return days === 0 ? "today" : days === 1 ? "1 day ago" : `${days} days ago`;
}

function ItemList({
  title,
  empty,
  items,
  now,
  onDone,
}: {
  title: string;
  empty: string;
  items: Capture[];
  now: number;
  onDone: (capture: Capture) => void;
}) {
  return (
    <div className="pm-section">
      <h3>
        {title} {items.length > 0 && <span className="count">{items.length}</span>}
      </h3>
      {items.length === 0 ? (
        <p className="muted small">{empty}</p>
      ) : (
        <ul>
          {items.map((item) => (
            <li key={item.id}>
              <Checkbox checked={false} aria-label={`Mark done: ${item.body}`} onChange={() => onDone(item)} />
              <div>
                <p>{item.body}</p>
                <p className="muted small">
                  {item.kind === "commitment" ? "I promised" : item.kind === "ask_of_me" ? "They asked" : "I asked"} ·{" "}
                  {age(item.createdAt, now)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function TeamPage({
  people,
  captures,
  work,
  now,
  onDone,
  onCapture,
  onAddPM,
  onOpen,
  upcoming,
  onSetAliases,
  timeOff,
  onAddTimeOff,
  onRemoveTimeOff,
}: {
  people: Person[];
  captures: Capture[];
  /** Synced tickets and epics; empty until an issue tracker is connected. */
  work: WorkItem[];
  now: number;
  onDone: (capture: Capture) => void;
  /** Opens quick capture already set to this person and kind. */
  onCapture: (personId: number, kind: CaptureKind) => void;
  onAddPM: (name: string) => void;
  /** Opens the 1:1 workspace for this PM. */
  onOpen: (personId: number) => void;
  /** Meetings from connected calendars, for each PM's next meeting. */
  upcoming: CalendarEventRecord[];
  onSetAliases: (personId: number, aliases: string[]) => void;
  timeOff: TimeOff[];
  onAddTimeOff: (entry: Omit<TimeOff, "id">) => Promise<void>;
  onRemoveTimeOff: (entry: TimeOff) => void;
}) {
  const board = teamBoard(people, captures, now);
  const epics = epicHealth(work, now);
  const [newPM, setNewPM] = useState("");
  // The PM whose other names are being edited, and the text so far.
  const [editingNames, setEditingNames] = useState<{ personId: number; text: string } | null>(null);
  const cadence = oneOnOneCadence(board.map((card) => card.person), captures, upcoming, now);
  const overdue = cadence.filter((entry) => entry.overdue);

  return (
    <div className="page">
      <header className="page-head with-controls">
        <div>
          <h1>Team</h1>
          <p>One card per PM: what they need from you, what you are waiting on, and your last 1:1.</p>
        </div>
        <form
          className="add-pm"
          onSubmit={(event) => {
            event.preventDefault();
            if (!newPM.trim()) return;
            onAddPM(newPM);
            setNewPM("");
          }}
        >
          <Input
            placeholder="Add a PM by name"
            aria-label="Add a PM by name"
            value={newPM}
            onChange={(event) => setNewPM(event.target.value)}
          />
          <Button htmlType="submit" type="primary" disabled={!newPM.trim()}>
            Add
          </Button>
        </form>
      </header>

      {overdue.length > 0 && (
        <section className="slip-banner" aria-label="1:1s overdue">
          <p>
            <strong>
              {overdue.length === 1 ? "One PM has" : `${overdue.length} PMs have`} had no 1:1 in over two weeks, and none is booked:
            </strong>{" "}
            {overdue.map((entry) => `${entry.person.name} (${entry.daysSince === null ? "never" : `${entry.daysSince} days`})`).join(", ")}.
          </p>
          <Button onClick={() => onCapture(overdue[0].person.id, "agenda")}>Add a topic for {overdue[0].person.name}</Button>
        </section>
      )}

      {board.length === 0 ? (
        <GlassCard className="team-empty">
          <h2>No PMs yet</h2>
          <p className="muted">
            Add each PM above, or mark an existing person as a PM under Captures. Their card fills in as you capture
            asks, commitments and 1:1 notes against them.
          </p>
        </GlassCard>
      ) : (
        <div className="team-grid">
          {board.map((card, index) => (
            <GlassCard key={card.person.id} className="pm-card" index={index} aria-label={card.person.name}>
              <header className="pm-head">
                <span className="avatar" aria-hidden="true">
                  {card.person.name.slice(0, 1).toUpperCase()}
                </span>
                <div>
                  <h2>
                    <button className="pm-name" onClick={() => onOpen(card.person.id)} title="Open the 1:1 workspace">
                      {card.person.name}
                    </button>
                  </h2>
                  <p className="muted small">
                    {card.lastCaptureAt === null ? "Nothing captured yet" : `Last captured ${age(card.lastCaptureAt, now)}`}
                  </p>
                </div>
                {card.recentWins > 0 && (
                  <Tag className="wins-tag" variant="filled" icon={<Trophy size={12} aria-hidden="true" />}>
                    {card.recentWins} {card.recentWins === 1 ? "win" : "wins"}
                  </Tag>
                )}
              </header>
              <NextMeeting person={card.person} upcoming={upcoming} now={now} />
              <PersonNudges cadence={cadence.find((entry) => entry.person.id === card.person.id)!} praise={daysSincePraise(card.person, captures, now)} />
              {editingNames?.personId === card.person.id ? (
                <form
                  className="add-line"
                  onSubmit={(event) => {
                    event.preventDefault();
                    onSetAliases(card.person.id, editingNames.text.split(","));
                    setEditingNames(null);
                  }}
                >
                  <Input
                    autoFocus
                    aria-label={`Other names for ${card.person.name}`}
                    placeholder="Names in other systems, separated by commas"
                    value={editingNames.text}
                    onChange={(event) => setEditingNames({ personId: card.person.id, text: event.target.value })}
                  />
                  <Button htmlType="submit" type="primary" size="small">
                    Save
                  </Button>
                  <Button size="small" onClick={() => setEditingNames(null)}>
                    Cancel
                  </Button>
                </form>
              ) : (
                <p className="muted small aliases">
                  {card.person.aliases.length > 0 ? `Also known as ${card.person.aliases.join(", ").replace(/\.$/, "")}. ` : ""}
                  <button
                    className={card.person.aliases.length > 0 ? "text-link" : "text-link quiet-link"}
                    title="Other names they go by in email, calendars or the tracker, so their tickets and meetings match"
                    onClick={() => setEditingNames({ personId: card.person.id, text: card.person.aliases.join(", ") })}
                  >
                    {card.person.aliases.length > 0 ? "Edit" : "Add other names"}
                  </button>
                </p>
              )}

              <ItemList
                title="Needs from me"
                empty="Nothing open."
                items={card.needsFromMe}
                now={now}
                onDone={onDone}
              />
              <ItemList
                title="I'm waiting on"
                empty="Nothing open."
                items={card.waitingOnThem}
                now={now}
                onDone={onDone}
              />

              <div className="pm-section">
                <h3>Last 1:1</h3>
                {card.lastOneOnOne ? (
                  <>
                    <p>{card.lastOneOnOne.body}</p>
                    <p className="muted small">{age(card.lastOneOnOne.createdAt, now)}</p>
                  </>
                ) : (
                  <p className="muted small">No 1:1 notes yet.</p>
                )}
              </div>

              <div className="pm-section">
                <h3>Epics</h3>
                {work.length === 0 ? (
                  <p className="muted small">No issue tracker is connected yet, so epics and their health are not shown.</p>
                ) : epicsFor(card.person, epics).length === 0 ? (
                  <p className="muted small">No epics are owned by {card.person.name} in the tracker.</p>
                ) : (
                  <ul className="epics">
                    {epicsFor(card.person, epics).map(({ epic, health, done, total }) => (
                      <li key={epic.id}>
                        <button className="item-title" onClick={() => void openExternal(epic.url)}>
                          {epic.title}
                        </button>
                        <span className="muted small">
                          {done}/{total}
                        </span>
                        <Tag className={`health ${health}`} variant="filled">
                          {HEALTH_LABELS[health]}
                        </Tag>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="pm-actions">
                <Button size="small" type="primary" onClick={() => onOpen(card.person.id)}>
                  1:1 workspace{card.agenda.length > 0 ? ` · ${card.agenda.length}` : ""}
                </Button>
                <Button
                  size="small"
                  icon={<Plus size={14} aria-hidden="true" />}
                  onClick={() => onCapture(card.person.id, "one_on_one")}
                >
                  1:1 note
                </Button>
                <Button
                  size="small"
                  icon={<Plus size={14} aria-hidden="true" />}
                  onClick={() => onCapture(card.person.id, "ask_of_them")}
                >
                  Ask
                </Button>
              </div>
            </GlassCard>
          ))}
        </div>
      )}

      <TimeOffCard people={people} timeOff={timeOff} now={now} onAdd={onAddTimeOff} onRemove={onRemoveTimeOff} />
    </div>
  );
}

/** A quiet line on a PM card when a 1:1 is overdue or nothing good has been noted for a while. */
function PersonNudges({ cadence, praise }: { cadence: { overdue: boolean; daysSince: number | null }; praise: number | null }) {
  const lines = [
    cadence.overdue ? (cadence.daysSince === null ? "No 1:1 notes yet" : `No 1:1 in ${cadence.daysSince} days`) : null,
    praise === null ? "No praise or wins recorded yet" : praise > 30 ? `No praise or wins recorded in ${praise} days` : null,
  ].filter(Boolean);
  if (lines.length === 0) return null;
  return (
    <p className="nudges small">
      {lines.map((line) => (
        <Tag key={line} variant="filled" className="nudge">
          {line}
        </Tag>
      ))}
    </p>
  );
}

const TEAM_OPTION = -1;

/** Who is out and when, for people and whole teams. */
function TimeOffCard({
  people,
  timeOff,
  now,
  onAdd,
  onRemove,
}: {
  people: Person[];
  timeOff: TimeOff[];
  now: number;
  onAdd: (entry: Omit<TimeOff, "id">) => Promise<void>;
  onRemove: (entry: TimeOff) => void;
}) {
  const [who, setWho] = useState<number | null>(null);
  const [team, setTeam] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const upcoming = timeOff.filter((entry) => entry.endsAt >= now);
  const startsAt = dueFromDateInput(from);
  const endsAt = dueFromDateInput(to || from);
  const ready = who !== null && startsAt !== null && endsAt !== null && (who !== TEAM_OPTION || team.trim() !== "");

  return (
    <GlassCard className="job-form time-off" aria-labelledby="time-off-title">
      <h2 id="time-off-title">Time off</h2>
      <p className="muted small">Holidays and leave, for people and whole teams. Shown on Delivery for the sprint they fall in.</p>
      {upcoming.length === 0 ? (
        <p className="muted small">None coming up.</p>
      ) : (
        <ul className="review-list">
          {upcoming.map((entry) => (
            <li key={entry.id}>
              {describeTimeOff(entry, people)}
              <Popconfirm title="Remove this time off?" okText="Remove" okButtonProps={{ danger: true }} onConfirm={() => onRemove(entry)}>
                <Button type="text" size="small" className="danger-hover" icon={<Trash2 size={13} aria-hidden="true" />} aria-label={`Remove ${describeTimeOff(entry, people)}`} />
              </Popconfirm>
            </li>
          ))}
        </ul>
      )}
      <form
        className="job-row time-off-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (!ready) return;
          setError(null);
          onAdd({ personId: who === TEAM_OPTION ? null : who, team: who === TEAM_OPTION ? team : "", startsAt: new Date(startsAt!).setHours(0, 0, 0, 0), endsAt: endsAt!, note }).then(
            () => {
              setFrom("");
              setTo("");
              setNote("");
            },
            (cause) => setError(String(cause instanceof Error ? cause.message : cause)),
          );
        }}
      >
        <label className="field">
          Who
          <Select
            aria-label="Who is off"
            placeholder="A person or a team"
            value={who ?? undefined}
            onChange={setWho}
            options={[...people.map((person) => ({ value: person.id, label: person.name })), { value: TEAM_OPTION, label: "A whole team (holiday)" }]}
          />
        </label>
        {who === TEAM_OPTION && (
          <label className="field">
            Team, as the tracker names it
            <Input aria-label="Team" value={team} placeholder="Offshore" onChange={(event) => setTeam(event.target.value)} />
          </label>
        )}
        <label className="field">
          From
          <input type="date" className="ant-input time-input" aria-label="From" value={from} onChange={(event) => setFrom(event.target.value)} />
        </label>
        <label className="field">
          To
          <input type="date" className="ant-input time-input" aria-label="To" value={to} min={from} onChange={(event) => setTo(event.target.value)} />
        </label>
        <label className="field">
          Note
          <Input aria-label="Note" value={note} placeholder="Optional" onChange={(event) => setNote(event.target.value)} />
        </label>
        <Button htmlType="submit" type="primary" disabled={!ready}>
          Add
        </Button>
      </form>
      {error && <p className="error">{error}</p>}
    </GlassCard>
  );
}
