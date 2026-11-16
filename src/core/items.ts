/**
 * Activity pulled in from other systems, in one shape the morning brief and the decision
 * queue can both read. Nothing here knows which systems exist: a source is whatever a
 * connection says it is (see connectors.ts), so a new kind of system needs no change here.
 */
export const BUCKETS = ["decision", "waiting", "fyi"] as const;
export type Bucket = (typeof BUCKETS)[number];

export const BUCKET_LABELS: Record<Bucket, string> = {
  decision: "Needs my decision",
  waiting: "Waiting on someone else",
  fyi: "FYI",
};

/** What a connector reports for one thread, page, ticket or anything else with a link. */
export interface Activity {
  /** The system's own id for the thing. One row is kept per source and id. */
  externalId: string;
  /** A short label for what happened, in the system's own words: "Email", "Comment", "Review requested". */
  kind: string;
  title: string;
  /** The latest message or change, in plain text. */
  snippet: string;
  /** Who wrote the latest message or made the change. */
  author: string;
  /** Opens the item in its own system. */
  url: string;
  /** When the latest message or change happened, in milliseconds since the epoch. */
  occurredAt: number;
  /** Sent to David directly, or mentioning him. */
  addressedToMe: boolean;
  /** The latest message or change is David's own. */
  fromMe: boolean;
}

/** An activity plus which connection it came from. */
export interface IncomingItem extends Activity {
  /** Identifies the connection. Any string; unique per connection. */
  source: string;
  /** What to call that connection on screen: "Work email", "Jira". */
  sourceName: string;
}

export interface SourceItem extends IncomingItem {
  id: number;
  /** Where the rules put it, or where David moved it. */
  bucket: Bucket;
  /** True when David chose the bucket himself. */
  moved: boolean;
  dismissedAt: number | null;
}

// Phrases that usually mean the writer wants an answer or a go-ahead.
const ASKS = [
  /\?/,
  /\bcan you\b/i,
  /\bcould you\b/i,
  /\bwould you\b/i,
  /\bplease (confirm|approve|review|advise|decide|sign)/i,
  /\bneed(s)? (your|a) (decision|approval|sign[- ]?off|input|call|answer|go[- ]ahead)/i,
  /\byour (call|decision|approval|sign[- ]?off|thoughts|input)\b/i,
  /\b(approve|approval|sign[- ]?off|go\/no[- ]go|blocked on you|waiting on you)\b/i,
  /\blet me know\b/i,
  /\bthoughts\b/i,
];

/**
 * Sorts an item by simple rules, with no AI:
 * - David spoke last and asked something: he is waiting on someone else.
 * - It is addressed to David and asks something: it needs his decision.
 * - Everything else is for information.
 * David can move anything the rules get wrong.
 */
export function classify(item: Pick<Activity, "title" | "snippet" | "addressedToMe" | "fromMe">): Bucket {
  const text = `${item.title}\n${item.snippet}`;
  const asks = ASKS.some((pattern) => pattern.test(text));
  if (item.fromMe) return asks ? "waiting" : "fyi";
  if (item.addressedToMe && asks) return "decision";
  return "fyi";
}

// Phrases that mean someone wants a document looked at rather than a yes or no.
const REVIEW = /\b(review(s|ed)?|feedback on|take a look|look over|read through|comments on)\b/i;

/** True when an item asks David to review something: a spec, a PRD, a draft. */
export function needsReview(item: Pick<SourceItem, "kind" | "title" | "snippet" | "bucket" | "fromMe">): boolean {
  return item.bucket === "decision" && !item.fromMe && REVIEW.test(`${item.kind}\n${item.title}\n${item.snippet}`);
}

/**
 * When "overnight" began: 6pm on the last working day before today,
 * so Monday morning covers the weekend.
 */
export function overnightStart(now: number): number {
  const today = new Date(now);
  const daysBack = today.getDay() === 1 ? 3 : today.getDay() === 0 ? 2 : 1;
  return new Date(today.getFullYear(), today.getMonth(), today.getDate() - daysBack, 18).getTime();
}

export interface Brief {
  since: number;
  /** Open decisions other than reviews, oldest first: the longest wait is at the top. */
  decisions: SourceItem[];
  /** Specs, PRDs and drafts waiting for David to read them, longest wait first. */
  reviews: SourceItem[];
  /** What changed since `since`, newest first, without the decisions above. */
  overnight: SourceItem[];
  /** Things David is waiting on that have gone three days without a reply. */
  stale: SourceItem[];
}

/** The morning brief: what needs David, what happened while he was away, what has stalled. */
export function buildBrief(items: SourceItem[], now: number): Brief {
  const since = overnightStart(now);
  const open = items.filter((item) => item.dismissedAt === null);
  const staleBefore = now - 3 * 86_400_000;
  return {
    since,
    decisions: open
      .filter((item) => item.bucket === "decision" && !needsReview(item))
      .sort((a, b) => a.occurredAt - b.occurredAt),
    reviews: open.filter(needsReview).sort((a, b) => a.occurredAt - b.occurredAt),
    overnight: open
      .filter((item) => item.bucket !== "decision" && !item.fromMe && item.occurredAt >= since)
      .sort((a, b) => b.occurredAt - a.occurredAt),
    stale: open
      .filter((item) => item.bucket === "waiting" && item.occurredAt < staleBefore)
      .sort((a, b) => a.occurredAt - b.occurredAt),
  };
}
