import { Button } from "antd";
import { buildBrief, type Bucket, type SourceItem } from "../core/items";
import { GlassCard } from "./components";
import { ItemRow } from "./ItemRow";

/** Shown wherever a page depends on connectors that are not set up yet. */
export function NotConnected() {
  return (
    <GlassCard className="team-empty">
      <h2>Nothing synced yet</h2>
      <p className="muted">
        This page fills from the systems you connect, such as email, a wiki or an issue tracker. Nothing is
        connected yet, so there is nothing to show. Quick captures, the team board and analytics work without them.
      </p>
    </GlassCard>
  );
}

export function BriefPage({
  items,
  now,
  connected,
  onMove,
  onDismiss,
  onOpenQueue,
}: {
  items: SourceItem[];
  now: number;
  /** False until at least one connector has synced. */
  connected: boolean;
  onMove: (item: SourceItem, bucket: Bucket) => void;
  onDismiss: (item: SourceItem) => void;
  onOpenQueue: () => void;
}) {
  const brief = buildBrief(items, now);
  const since = new Date(brief.since).toLocaleString(undefined, { weekday: "long", hour: "numeric" });
  // Keeps the brief to one screen; the queue has the rest.
  const overnight = brief.overnight.slice(0, 6);

  const section = (title: string, empty: string, list: SourceItem[], index: number, extra?: React.ReactNode) => (
    <GlassCard className="brief-section" index={index} aria-label={title}>
      <h2>
        {title} {list.length > 0 && <span className="count">{list.length}</span>}
      </h2>
      {list.length === 0 ? (
        <p className="muted">{empty}</p>
      ) : (
        <ul className="items">
          {list.map((item) => (
            <ItemRow key={item.id} item={item} now={now} onMove={onMove} onDismiss={onDismiss} />
          ))}
        </ul>
      )}
      {extra}
    </GlassCard>
  );

  return (
    <div className="page">
      <header className="page-head">
        <h1>Morning brief</h1>
        <p>What needs you, and what happened since {since}.</p>
      </header>

      {!connected ? (
        <NotConnected />
      ) : (
        <div className="brief-grid">
          <div className="brief-side">
            {section("Needs my decision", "Nothing is waiting on a decision from you.", brief.decisions, 0)}
            {brief.reviews.length > 0 && section("Awaiting my review", "", brief.reviews, 1)}
          </div>
          <div className="brief-side">
            {section(
              "While you were away",
              "Nothing new since last evening.",
              overnight,
              1,
              brief.overnight.length > overnight.length && (
                <Button type="link" className="see-all" onClick={onOpenQueue}>
                  See all {brief.overnight.length} in the queue
                </Button>
              ),
            )}
            {brief.stale.length > 0 &&
              section("No reply in three days", "", brief.stale, 2)}
          </div>
        </div>
      )}
    </div>
  );
}
