import { Button, Checkbox, Tag } from "antd";
import { Pencil, Sparkles } from "lucide-react";
import { commitmentBoard, type TrackedCommitment } from "../core/commitments";
import type { Capture } from "../core/models";
import { GlassCard } from "./components";
import { useAppActions } from "./navigation";

function dueText(entry: TrackedCommitment): string {
  if (entry.capture.dueAt === null) return "No date";
  if (entry.dueInDays === 0) return "Due today";
  if (entry.dueInDays === 1) return "Due tomorrow";
  return `Due ${new Date(entry.capture.dueAt).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}`;
}

/** Open promises in both directions, with the ones that have slipped at the top. */
export function CommitmentsPage({
  captures,
  now,
  personName,
  onDone,
  onEdit,
}: {
  captures: Capture[];
  now: number;
  personName: (id: number | null) => string | undefined;
  onDone: (capture: Capture) => void;
  /** Opens the capture for editing, which is where its date is set. */
  onEdit: (capture: Capture) => void;
}) {
  const board = commitmentBoard(captures, now);
  const actions = useAppActions();

  const list = (title: string, empty: string, entries: TrackedCommitment[], index: number, who: (c: Capture) => string) => (
    <GlassCard className="brief-section" index={index} aria-label={title}>
      <h2>
        {title} {entries.length > 0 && <span className="count">{entries.length}</span>}
      </h2>
      {entries.length === 0 ? (
        <p className="muted">{empty}</p>
      ) : (
        <ul className="items">
          {entries.map((entry) => (
            <li key={entry.capture.id} className="item">
              <Checkbox
                checked={false}
                aria-label={`Mark done: ${entry.capture.body}`}
                onChange={() => onDone(entry.capture)}
              />
              <div className="item-text">
                <p>{entry.capture.body}</p>
                <p className="item-meta">
                  <span>{who(entry.capture)}</span>
                  {entry.slippedDays > 0 ? (
                    <Tag className="slipped" variant="filled">
                      Slipped {entry.slippedDays} {entry.slippedDays === 1 ? "day" : "days"}
                    </Tag>
                  ) : (
                    <span>· {dueText(entry)}</span>
                  )}
                </p>
              </div>
              <Button
                type="text"
                shape="circle"
                icon={<Pencil size={15} aria-hidden="true" />}
                aria-label={`Edit: ${entry.capture.body}`}
                title="Edit, or set a date"
                onClick={() => onEdit(entry.capture)}
              />
            </li>
          ))}
        </ul>
      )}
    </GlassCard>
  );

  return (
    <div className="page">
      <header className="page-head with-controls">
        <div>
          <h1>Commitments</h1>
          <p>
            {board.slipped === 0
              ? "Nothing has slipped."
              : `${board.slipped} ${board.slipped === 1 ? "promise has" : "promises have"} slipped past the date.`}{" "}
            Give a commitment a date when you capture or edit it.
          </p>
        </div>
        <Button icon={<Sparkles size={14} aria-hidden="true" />} onClick={() => actions.openMeetingNotes()}>
          Notes into actions
        </Button>
      </header>
      <div className="brief-grid">
        {list("I promised", "You have no open commitments.", board.mine, 0, (capture) => {
          const person = personName(capture.personId);
          return capture.kind === "ask_of_me" ? `${person ?? "Someone"} asked` : person ? `To ${person}` : "My commitment";
        })}
        {list("Promised to me", "Nobody owes you anything.", board.theirs, 1, (capture) => personName(capture.personId) ?? "No person set")}
      </div>
    </div>
  );
}
