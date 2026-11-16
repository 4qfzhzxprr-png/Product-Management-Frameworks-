import { BUCKET_LABELS, BUCKETS, type Bucket, type SourceItem } from "../core/items";
import { NotConnected } from "./BriefPage";
import { GlassCard } from "./components";
import { ItemRow } from "./ItemRow";

const EMPTY: Record<Bucket, string> = {
  decision: "Nothing is waiting on a decision from you.",
  waiting: "You are not waiting on anyone.",
  fyi: "Nothing to read.",
};

/** Everything synced, sorted into three lists. David can move or dismiss any item. */
export function QueuePage({
  items,
  now,
  connected,
  onMove,
  onDismiss,
}: {
  items: SourceItem[];
  now: number;
  connected: boolean;
  onMove: (item: SourceItem, bucket: Bucket) => void;
  onDismiss: (item: SourceItem) => void;
}) {
  return (
    <div className="page">
      <header className="page-head">
        <h1>Decision queue</h1>
        <p>Activity from every connected system, sorted by simple rules. Move anything that landed in the wrong list.</p>
      </header>

      {!connected ? (
        <NotConnected />
      ) : (
        <div className="queue-grid">
          {BUCKETS.map((bucket, index) => {
            const list = items
              .filter((item) => item.bucket === bucket)
              // Decisions: longest wait first. The rest: newest first.
              .sort((a, b) => (bucket === "decision" ? a.occurredAt - b.occurredAt : b.occurredAt - a.occurredAt));
            return (
              <GlassCard key={bucket} className="brief-section" index={index} aria-label={BUCKET_LABELS[bucket]}>
                <h2>
                  {BUCKET_LABELS[bucket]} {list.length > 0 && <span className="count">{list.length}</span>}
                </h2>
                {list.length === 0 ? (
                  <p className="muted">{EMPTY[bucket]}</p>
                ) : (
                  <ul className="items">
                    {list.map((item) => (
                      <ItemRow key={item.id} item={item} now={now} onMove={onMove} onDismiss={onDismiss} />
                    ))}
                  </ul>
                )}
              </GlassCard>
            );
          })}
        </div>
      )}
    </div>
  );
}
