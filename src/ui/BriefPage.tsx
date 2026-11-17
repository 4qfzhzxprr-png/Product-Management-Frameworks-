import { Button } from "antd";
import type { CalendarEvent } from "../core/calendar";
import { buildBrief, type Bucket, type SourceItem } from "../core/items";
import { useNavigate } from "./navigation";
import { GlassCard } from "./components";
import { ItemRow } from "./ItemRow";

function clock(time: number): string {
  return new Date(time).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/** Today's meetings as one compact strip, so the brief still fits on one screen. */
function TodaysMeetings({ meetings, now }: { meetings: CalendarEvent[]; now: number }) {
  const next = meetings.find((meeting) => !meeting.allDay && meeting.startsAt >= now);
  return (
    <section className="meeting-strip" aria-labelledby="today-meetings">
      <h2 id="today-meetings">Today</h2>
      <ul className="meetings">
        {meetings.map((meeting) => (
          <li
            key={meeting.id}
            className={!meeting.allDay && meeting.endsAt <= now ? "past" : meeting === next ? "next" : undefined}
            title={meeting.location || undefined}
          >
            <span className="meeting-time">{meeting.allDay ? "All day" : clock(meeting.startsAt)}</span>{" "}
            <span className="meeting-title">{meeting.title}</span>
            {meeting === next && <span className="visually-hidden"> (next)</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Shown wherever a page depends on connectors that are not set up yet. */
export function NotConnected() {
  const navigate = useNavigate();
  return (
    <GlassCard className="team-empty">
      <h2>Nothing synced yet</h2>
      <p className="muted">
        This page fills from the systems you connect, such as email, a wiki or an issue tracker. None has sent
        anything yet. Quick captures, the team board and analytics work without them.
      </p>
      <Button type="primary" onClick={() => navigate("connections")}>
        Set up connections
      </Button>
    </GlassCard>
  );
}

export function BriefPage({
  items,
  now,
  connected,
  meetings,
  onMove,
  onDismiss,
  onOpenQueue,
}: {
  items: SourceItem[];
  now: number;
  /** False until at least one connector has synced. */
  connected: boolean;
  /** Today's meetings from connected calendars. */
  meetings: CalendarEvent[];
  onMove: (item: SourceItem, bucket: Bucket) => void;
  onDismiss: (item: SourceItem) => void;
  onOpenQueue: () => void;
}) {
  const brief = buildBrief(items, now);
  const since = new Date(brief.since).toLocaleString(undefined, { weekday: "long", hour: "numeric" });
  // Keeps the brief to one screen; the queue has the rest.
  // Four, so the brief still fits on one screen with today's meetings above it.
  const overnight = brief.overnight.slice(0, 4);

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

      {meetings.length > 0 && <TodaysMeetings meetings={meetings} now={now} />}

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
