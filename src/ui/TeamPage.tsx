import { Button, Checkbox, Input, Tag } from "antd";
import { Plus, Trophy } from "lucide-react";
import { useState } from "react";
import type { CalendarEventRecord } from "../core/calendar";
import type { Capture, CaptureKind, Person } from "../core/models";
import { teamBoard } from "../core/team";
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
}) {
  const board = teamBoard(people, captures, now);
  const epics = epicHealth(work, now);
  const [newPM, setNewPM] = useState("");
  // The PM whose other names are being edited, and the text so far.
  const [editingNames, setEditingNames] = useState<{ personId: number; text: string } | null>(null);

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
    </div>
  );
}
