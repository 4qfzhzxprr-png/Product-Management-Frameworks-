import type { Db } from "./db";

/**
 * Meetings from any calendar, in one shape the pages can read. A connector reports these;
 * nothing here knows which calendar they came from.
 */
export interface CalendarEventRecord {
  /** The calendar's own id for this occurrence. */
  externalId: string;
  title: string;
  /** Milliseconds since the epoch. */
  startsAt: number;
  endsAt: number;
  allDay: boolean;
  location: string;
  url: string;
}

export interface CalendarEvent extends CalendarEventRecord {
  id: number;
  source: string;
  sourceName: string;
}

interface EventRow {
  id: number;
  source: string;
  source_name: string;
  external_id: string;
  title: string;
  starts_at: number;
  ends_at: number;
  all_day: number;
  location: string;
  url: string;
}

/** Local storage for synced meetings. The table is created by CaptureStore.open. */
export class CalendarStore {
  constructor(private readonly db: Db) {}

  /** A calendar sync reports a whole window of meetings, so it replaces what that connection had. */
  async replaceSource(source: string, sourceName: string, events: CalendarEventRecord[]): Promise<void> {
    await this.deleteSource(source);
    for (const event of events) {
      await this.db.run(
        `INSERT INTO calendar_events (source, source_name, external_id, title, starts_at, ends_at, all_day, location, url)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          source, sourceName, event.externalId, event.title, event.startsAt, event.endsAt,
          event.allDay ? 1 : 0, event.location, event.url,
        ],
      );
    }
  }

  /** Meetings that overlap `from` to `to`, earliest first. */
  async between(from: number, to: number): Promise<CalendarEvent[]> {
    const rows = await this.db.all<EventRow>(
      "SELECT * FROM calendar_events WHERE starts_at < ? AND ends_at > ? ORDER BY starts_at, id",
      [to, from],
    );
    return rows.map((row) => ({
      id: row.id,
      source: row.source,
      sourceName: row.source_name,
      externalId: row.external_id,
      title: row.title,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      allDay: row.all_day === 1,
      location: row.location,
      url: row.url,
    }));
  }

  async deleteSource(source: string): Promise<void> {
    await this.db.run("DELETE FROM calendar_events WHERE source = ?", [source]);
  }
}

/**
 * The parts of `window` not taken by timed meetings, as [start, end] pairs.
 * All-day events are ignored: they are usually reminders, not time away.
 */
export function freeSlots(window: [number, number], events: CalendarEventRecord[]): [number, number][] {
  const busy = events
    .filter((event) => !event.allDay && event.endsAt > window[0] && event.startsAt < window[1])
    .map((event) => [Math.max(event.startsAt, window[0]), Math.min(event.endsAt, window[1])] as [number, number])
    .sort((a, b) => a[0] - b[0]);
  const free: [number, number][] = [];
  let cursor = window[0];
  for (const [start, end] of busy) {
    if (start > cursor) free.push([cursor, start]);
    cursor = Math.max(cursor, end);
  }
  if (cursor < window[1]) free.push([cursor, window[1]]);
  return free;
}
