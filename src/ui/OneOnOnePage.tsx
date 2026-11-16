import { Button, Checkbox, Input, Tag } from "antd";
import { ArrowLeft, X } from "lucide-react";
import { useState } from "react";
import type { Capture, CaptureKind, Person } from "../core/models";
import { isCarriedOver, teamBoard } from "../core/team";
import { GlassCard } from "./components";

function day(time: number): string {
  return new Date(time).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function age(time: number, now: number): string {
  const days = Math.floor((now - time) / 86_400_000);
  return days === 0 ? "today" : days === 1 ? "1 day ago" : `${days} days ago`;
}

/** A one-line field that adds a capture of one kind when submitted. */
function AddLine({ placeholder, onAdd }: { placeholder: string; onAdd: (body: string) => void }) {
  const [value, setValue] = useState("");
  return (
    <form
      className="add-line"
      onSubmit={(event) => {
        event.preventDefault();
        if (!value.trim()) return;
        onAdd(value);
        setValue("");
      }}
    >
      <Input placeholder={placeholder} aria-label={placeholder} value={value} onChange={(event) => setValue(event.target.value)} />
      <Button htmlType="submit" disabled={!value.trim()}>
        Add
      </Button>
    </form>
  );
}

function Checklist({
  items,
  empty,
  detail,
  doneLabel,
  onDone,
  onDelete,
}: {
  items: Capture[];
  empty: string;
  detail: (item: Capture) => React.ReactNode;
  /** What ticking an item means, for screen readers. */
  doneLabel: string;
  onDone: (item: Capture) => void;
  onDelete: (item: Capture) => void;
}) {
  if (items.length === 0) return <p className="muted small">{empty}</p>;
  return (
    <ul className="workspace-list">
      {items.map((item) => (
        <li key={item.id}>
          <Checkbox checked={false} aria-label={`${doneLabel}: ${item.body}`} onChange={() => onDone(item)} />
          <div>
            <p>{item.body}</p>
            <p className="muted small">{detail(item)}</p>
          </div>
          <Button
            type="text"
            size="small"
            shape="circle"
            icon={<X size={14} aria-hidden="true" />}
            aria-label={`Delete: ${item.body}`}
            title="Delete"
            onClick={() => onDelete(item)}
          />
        </li>
      ))}
    </ul>
  );
}

/** Everything for one PM's 1:1: the running agenda, what each of you owes, and past notes. */
export function OneOnOnePage({
  personId,
  people,
  captures,
  now,
  onBack,
  onAdd,
  onDone,
  onDelete,
}: {
  personId: number;
  people: Person[];
  captures: Capture[];
  now: number;
  onBack: () => void;
  onAdd: (kind: CaptureKind, body: string) => void;
  onDone: (capture: Capture, done: boolean) => void;
  onDelete: (capture: Capture) => void;
}) {
  const [note, setNote] = useState("");
  const card = teamBoard(people, captures, now).find((candidate) => candidate.person.id === personId);

  if (!card) {
    return (
      <div className="page">
        <Button type="link" className="back" icon={<ArrowLeft size={15} aria-hidden="true" />} onClick={onBack}>
          Team
        </Button>
        <p className="muted">This person is no longer marked as one of your PMs.</p>
      </div>
    );
  }

  const carried = card.agenda.filter((topic) => isCarriedOver(topic, card, now)).length;
  const done = (item: Capture) => onDone(item, true);

  return (
    <div className="page">
      <Button type="link" className="back" icon={<ArrowLeft size={15} aria-hidden="true" />} onClick={onBack}>
        Team
      </Button>
      <header className="page-head">
        <h1>1:1 with {card.person.name}</h1>
        <p>
          {card.lastOneOnOne ? `Last 1:1 note ${age(card.lastOneOnOne.createdAt, now)}` : "No 1:1 notes yet"}
          {" · "}
          {card.agenda.length} on the agenda
          {carried > 0 ? `, ${carried} carried over` : ""}
        </p>
      </header>

      <div className="oneonone-grid">
        <GlassCard className="workspace-card" index={0} aria-labelledby="agenda-title">
          <h2 id="agenda-title">Agenda</h2>
          <p className="muted small">Topics stay here until you tick them as discussed.</p>
          <AddLine placeholder="Add a topic" onAdd={(body) => onAdd("agenda", body)} />
          <Checklist
            items={card.agenda}
            empty="Nothing to raise yet."
            doneLabel="Mark discussed"
            onDone={done}
            onDelete={onDelete}
            detail={(topic) => (
              <>
                Added {age(topic.createdAt, now)}
                {isCarriedOver(topic, card, now) && <Tag variant="filled">Carried over</Tag>}
              </>
            )}
          />
        </GlassCard>

        <GlassCard className="workspace-card" index={1} aria-labelledby="owed-title">
          <h2 id="owed-title">Commitments</h2>
          <div className="pm-section">
            <h3>
              I owe {card.person.name} {card.needsFromMe.length > 0 && <span className="count">{card.needsFromMe.length}</span>}
            </h3>
            <Checklist
              items={card.needsFromMe}
              empty="Nothing open."
              doneLabel="Mark done"
              onDone={done}
              onDelete={onDelete}
              detail={(item) => `${item.kind === "commitment" ? "I promised" : "They asked"} · ${age(item.createdAt, now)}`}
            />
          </div>
          <AddLine placeholder="Something I promised" onAdd={(body) => onAdd("commitment", body)} />
          <div className="pm-section">
            <h3>
              {card.person.name} owes me{" "}
              {card.waitingOnThem.length > 0 && <span className="count">{card.waitingOnThem.length}</span>}
            </h3>
            <Checklist
              items={card.waitingOnThem}
              empty="Nothing open."
              doneLabel="Mark done"
              onDone={done}
              onDelete={onDelete}
              detail={(item) => `I asked · ${age(item.createdAt, now)}`}
            />
          </div>
          <AddLine placeholder="Something I asked for" onAdd={(body) => onAdd("ask_of_them", body)} />
        </GlassCard>

        <GlassCard className="workspace-card" index={2} aria-labelledby="notes-title">
          <h2 id="notes-title">1:1 notes</h2>
          <form
            className="note-form"
            onSubmit={(event) => {
              event.preventDefault();
              if (!note.trim()) return;
              onAdd("one_on_one", note);
              setNote("");
            }}
          >
            <Input.TextArea
              aria-label="Notes from this 1:1"
              placeholder="Notes from this 1:1"
              autoSize={{ minRows: 3, maxRows: 8 }}
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
            <Button htmlType="submit" type="primary" disabled={!note.trim()}>
              Save note
            </Button>
          </form>
          {card.oneOnOnes.length === 0 ? (
            <p className="muted small">Notes you save appear here, newest first.</p>
          ) : (
            <ul className="workspace-list notes">
              {card.oneOnOnes.map((entry) => (
                <li key={entry.id}>
                  <p className="muted small">{day(entry.createdAt)}</p>
                  <p>{entry.body}</p>
                </li>
              ))}
            </ul>
          )}
        </GlassCard>
      </div>
    </div>
  );
}
