import { Button, Input } from "antd";
import { ArrowUpRight, Copy, NotebookPen } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { RoadmapStatus } from "../core/leadership";
import { STORY_LABELS, storyType } from "../core/influence";
import { KIND_LABELS, type Capture, type Person } from "../core/models";
import type { CaptureStore } from "../core/store";
import { reviewText, weekKey, weekReview, WEEKLY_SETTINGS, type WeekPlan } from "../core/weekly";
import type { WorkItem } from "../core/work";
import { GlassCard } from "./components";
import { useToast } from "./Toast";
import { message } from "./useStore";

const day = (time: number) => new Date(time).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });

/** The Friday wrap-up: a look back, and three priorities for next week. */
export function WeeklyReviewPage({
  store,
  captures,
  work,
  roadmap,
  people,
  now,
  onOpenLeadership,
}: {
  store: CaptureStore;
  captures: Capture[];
  work: WorkItem[];
  roadmap: RoadmapStatus[];
  people: Person[];
  now: number;
  onOpenLeadership: () => void;
}) {
  const toast = useToast();
  const review = useMemo(() => weekReview({ captures, work, roadmap, now }), [captures, work, roadmap, now]);
  const key = `${WEEKLY_SETTINGS}:${weekKey(review.from)}`;
  const [plan, setPlan] = useState<WeekPlan>({ priorities: ["", "", ""], note: "" });
  const [copied, setCopied] = useState(false);
  const name = (id: number | null) => people.find((person) => person.id === id)?.name;

  useEffect(() => {
    let stale = false;
    store.settings.get<WeekPlan>(key).then((saved) => {
      if (!stale) setPlan({ priorities: [0, 1, 2].map((index) => saved?.priorities[index] ?? ""), note: saved?.note ?? "" });
    });
    return () => {
      stale = true;
    };
  }, [store, key]);

  const save = (next: WeekPlan) => {
    setPlan(next);
    store.settings.set(key, next).catch((cause) => toast({ text: message(cause) }));
  };

  const text = reviewText(review, plan, people);
  const list = (items: Capture[], empty: string, detail: (capture: Capture) => string) =>
    items.length === 0 ? (
      <p className="muted small">{empty}</p>
    ) : (
      <ul className="review-list">
        {items.map((capture) => (
          <li key={capture.id}>
            {capture.body}
            <span className="muted small"> · {detail(capture)}</span>
          </li>
        ))}
      </ul>
    );

  return (
    <div className="page">
      <header className="page-head with-controls">
        <div>
          <h1>Weekly review</h1>
          <p>
            {review.label}, {day(review.from)} to {day(review.to - 1)}: what shipped, what got done, what slipped, and what matters next.
          </p>
        </div>
        <div className="head-controls">
          <Button
            icon={<Copy size={14} aria-hidden="true" />}
            onClick={() =>
              navigator.clipboard.writeText(text).then(
                () => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                },
                () => toast({ text: "Could not copy." }),
              )
            }
          >
            {copied ? "Copied" : "Copy"}
          </Button>
          <Button
            type="primary"
            icon={<NotebookPen size={14} aria-hidden="true" />}
            onClick={() =>
              void store.addCapture({ body: text, kind: "note" }).then((saved) =>
                toast({ text: "Saved the review as a note", undo: () => store.deleteCapture(saved.id) }),
              )
            }
          >
            Save as a note
          </Button>
        </div>
      </header>

      <div className="review-grid">
        <GlassCard index={0} aria-labelledby="review-shipped">
          <h2 id="review-shipped">
            Shipped <span className="count">{review.shippedCount}</span>
          </h2>
          {review.shipped.length === 0 ? (
            <p className="muted small">{work.length === 0 ? "No tracker connected yet." : "Nothing finished in the tracker."}</p>
          ) : (
            <ul className="review-list">
              {review.shipped.map((group) => (
                <li key={group.epic}>
                  <strong>{group.epic}</strong>
                  <span className="muted small"> · {group.items.join("; ")}</span>
                </li>
              ))}
            </ul>
          )}
        </GlassCard>

        <GlassCard index={1} aria-labelledby="review-wins">
          <h2 id="review-wins">
            Wins <span className="count">{review.wins.length}</span>
          </h2>
          {list(review.wins, "None captured. Worth a minute to think of one.", (capture) => STORY_LABELS[storyType(capture)!])}
        </GlassCard>

        <GlassCard index={2} aria-labelledby="review-done">
          <h2 id="review-done">
            Done <span className="count">{review.done.length}</span>
          </h2>
          {list(review.done, "Nothing ticked off.", (capture) => [KIND_LABELS[capture.kind], name(capture.personId)].filter(Boolean).join(", "))}
        </GlassCard>

        <GlassCard index={3} aria-labelledby="review-decisions">
          <h2 id="review-decisions">
            Decisions <span className="count">{review.decisions.length}</span>
          </h2>
          {list(review.decisions, "None captured.", (capture) => day(capture.createdAt))}
        </GlassCard>

        <GlassCard index={4} className={review.slipped.length + review.leadership.length > 0 ? "alerts" : ""} aria-labelledby="review-slipped">
          <h2 id="review-slipped">
            Slipped <span className="count">{review.slipped.length + review.leadership.length}</span>
          </h2>
          {review.slipped.length + review.leadership.length === 0 ? (
            <p className="muted small">Nothing slipped.</p>
          ) : (
            <ul className="review-list">
              {review.slipped.map((entry) => (
                <li key={entry.capture.id}>
                  {entry.capture.body}
                  <span className="muted small"> · {entry.days} {entry.days === 1 ? "day" : "days"} late</span>
                </li>
              ))}
              {review.leadership.map((status) => (
                <li key={`roadmap-${status.item.id}`}>
                  {status.item.title}
                  <span className="muted small"> · promised to leadership; {status.reasons[0] ?? status.state}</span>
                </li>
              ))}
            </ul>
          )}
          {review.leadership.length > 0 && (
            <Button type="link" className="see-all" icon={<ArrowUpRight size={14} aria-hidden="true" />} iconPlacement="end" onClick={onOpenLeadership}>
              Tell the CPO in this week's update
            </Button>
          )}
        </GlassCard>

        <GlassCard index={5} className="review-plan" aria-labelledby="review-next">
          <h2 id="review-next">Next week's three priorities</h2>
          <ol className="priority-inputs">
            {plan.priorities.map((value, index) => (
              <li key={index}>
                <Input
                  aria-label={`Priority ${index + 1}`}
                  value={value}
                  placeholder={review.open[index] ? `For example: ${review.open[index].body}` : "What matters most next week?"}
                  onChange={(event) => setPlan({ ...plan, priorities: plan.priorities.map((entry, at) => (at === index ? event.target.value : entry)) })}
                  onBlur={() => save(plan)}
                />
              </li>
            ))}
          </ol>
          <label className="field">
            Notes for yourself
            <Input.TextArea
              aria-label="Notes for yourself"
              value={plan.note}
              autoSize={{ minRows: 2, maxRows: 6 }}
              onChange={(event) => setPlan({ ...plan, note: event.target.value })}
              onBlur={() => save(plan)}
            />
          </label>
          <p className="muted small">Saved for this week as you type, and included when you copy or save the review.</p>
        </GlassCard>
      </div>
    </div>
  );
}
