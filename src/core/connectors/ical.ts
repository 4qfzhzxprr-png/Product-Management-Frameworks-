import { dayStart } from "../insights";
import type { CalendarEventRecord } from "../calendar";
import type { Connector } from "../connectors";
import { instant, type Wall } from "../time";

const DAY = 86_400_000;

/** Days of past and future meetings kept from a feed. */
export const PAST_DAYS = 7;
export const FUTURE_DAYS = 30;

// Outlook and Exchange name zones the Windows way. These are the common ones; anything else
// that is not a valid IANA name is read as this Mac's local time.
const WINDOWS_ZONES: Record<string, string> = {
  "Pacific Standard Time": "America/Los_Angeles",
  "Mountain Standard Time": "America/Denver",
  "US Mountain Standard Time": "America/Phoenix",
  "Central Standard Time": "America/Chicago",
  "Eastern Standard Time": "America/New_York",
  "GMT Standard Time": "Europe/London",
  "Greenwich Standard Time": "Etc/GMT",
  "W. Europe Standard Time": "Europe/Berlin",
  "Central Europe Standard Time": "Europe/Budapest",
  "Romance Standard Time": "Europe/Paris",
  "India Standard Time": "Asia/Kolkata",
  "Sri Lanka Standard Time": "Asia/Colombo",
  "Singapore Standard Time": "Asia/Singapore",
  "China Standard Time": "Asia/Shanghai",
  "Tokyo Standard Time": "Asia/Tokyo",
  "AUS Eastern Standard Time": "Australia/Sydney",
  "UTC": "UTC",
};

function validZone(zone: string): string | null {
  const name = WINDOWS_ZONES[zone] ?? zone;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: name });
    return name;
  } catch {
    return null;
  }
}

interface Property {
  name: string;
  params: Record<string, string>;
  value: string;
}

/** Splits a feed into content lines, joining folded lines. */
function unfold(text: string): string[] {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/\n[ \t]/g, "").split("\n").filter(Boolean);
}

function parseLine(line: string): Property | null {
  // The value starts at the first colon that is not inside a quoted parameter.
  let quoted = false;
  let split = -1;
  for (let index = 0; index < line.length; index++) {
    if (line[index] === '"') quoted = !quoted;
    if (line[index] === ":" && !quoted) {
      split = index;
      break;
    }
  }
  if (split < 0) return null;
  const [name, ...rawParams] = line.slice(0, split).split(";");
  const params: Record<string, string> = {};
  for (const param of rawParams) {
    const [key, ...rest] = param.split("=");
    params[key.toUpperCase()] = rest.join("=").replace(/^"|"$/g, "");
  }
  return { name: name.toUpperCase(), params, value: line.slice(split + 1) };
}

function unescapeText(value: string): string {
  return value.replace(/\\n/gi, "\n").replace(/\\([,;\\])/g, "$1").trim();
}

/** How a time is anchored: a time zone, UTC, or this Mac's local time ("floating"). */
type Anchor = { zone: string } | { utc: true } | { local: true };

interface When {
  wall: Wall;
  anchor: Anchor;
  dateOnly: boolean;
}

function parseWhen(property: Property): When | null {
  const match = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(property.value.trim());
  if (!match) return null;
  const wall: Wall = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4] ?? 0),
    minute: Number(match[5] ?? 0),
  };
  const dateOnly = match[4] === undefined;
  if (match[7]) return { wall, anchor: { utc: true }, dateOnly };
  const zone = property.params.TZID ? validZone(property.params.TZID) : null;
  return { wall, anchor: zone && !dateOnly ? { zone } : { local: true }, dateOnly };
}

function toInstant(wall: Wall, anchor: Anchor): number {
  if ("utc" in anchor) return Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute);
  if ("zone" in anchor) return instant(anchor.zone, wall);
  return new Date(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute).getTime();
}

/** Moves a wall time by whole days, months or years, keeping the clock time. */
function shift(wall: Wall, days = 0, months = 0, years = 0): Wall {
  const date = new Date(Date.UTC(wall.year + years, wall.month - 1 + months, wall.day + days, wall.hour, wall.minute));
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    hour: date.getUTCHours(),
    minute: date.getUTCMinutes(),
  };
}

function weekday(wall: Wall): number {
  return new Date(Date.UTC(wall.year, wall.month - 1, wall.day)).getUTCDay();
}

const DAYS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

function parseDuration(value: string): number | null {
  const match = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(value.trim());
  if (!match) return null;
  const [, sign, weeks, days, hours, minutes, seconds] = match;
  const ms =
    ((Number(weeks ?? 0) * 7 + Number(days ?? 0)) * 24 * 3600 +
      Number(hours ?? 0) * 3600 +
      Number(minutes ?? 0) * 60 +
      Number(seconds ?? 0)) *
    1000;
  return sign === "-" ? -ms : ms;
}

/** The start walls of a series, from its first occurrence on, while `keep` says to continue. */
function* occurrences(start: Wall, rule: Record<string, string>): Generator<Wall> {
  const freq = rule.FREQ;
  const interval = Math.max(1, Number(rule.INTERVAL ?? 1));
  if (freq === "DAILY") {
    for (let step = 0; ; step++) yield shift(start, step * interval);
  }
  if (freq === "WEEKLY") {
    const byDay = (rule.BYDAY ?? "")
      .split(",")
      .map((day) => DAYS.indexOf(day.trim().slice(-2)))
      .filter((day) => day >= 0);
    const days = byDay.length > 0 ? byDay.sort((a, b) => a - b) : [weekday(start)];
    // Weeks start on the event's own weekday's Sunday; occurrences before the start are skipped.
    const sunday = shift(start, -weekday(start));
    for (let week = 0; ; week++) {
      for (const day of days) {
        const candidate = shift(sunday, week * 7 * interval + day);
        if (Date.UTC(candidate.year, candidate.month - 1, candidate.day) >= Date.UTC(start.year, start.month - 1, start.day)) {
          yield candidate;
        }
      }
    }
  }
  if (freq === "MONTHLY" && !rule.BYDAY) {
    for (let step = 0; ; step++) {
      const candidate = shift(start, 0, step * interval);
      // Skip months without that date, such as the 31st in April.
      if (candidate.day === start.day) yield candidate;
    }
  }
  if (freq === "YEARLY" && !rule.BYDAY) {
    for (let step = 0; ; step++) yield shift(start, 0, 0, step * interval);
  }
  // Anything else (for example "the second Tuesday of each month") yields only the first one.
  yield start;
}

function parseRule(value: string): Record<string, string> {
  return Object.fromEntries(value.split(";").map((part) => part.split("=") as [string, string]));
}

interface RawEvent {
  props: Property[];
}

function first(event: RawEvent, name: string): Property | undefined {
  return event.props.find((property) => property.name === name);
}

/**
 * Reads an iCalendar feed and returns the meetings between `from` and `to`, with repeating
 * meetings expanded. Cancelled meetings and cancelled occurrences are left out.
 */
export function parseCalendar(text: string, from: number, to: number): CalendarEventRecord[] {
  const raw: RawEvent[] = [];
  let current: RawEvent | null = null;
  let depth = 0;
  for (const line of unfold(text)) {
    const property = parseLine(line);
    if (!property) continue;
    if (property.name === "BEGIN" && property.value.toUpperCase() === "VEVENT") {
      current = { props: [] };
      depth = 0;
    } else if (current && property.name === "BEGIN") {
      depth++; // An alarm or other nested block: its properties are not the event's.
    } else if (current && property.name === "END" && depth > 0) {
      depth--;
    } else if (current && property.name === "END" && property.value.toUpperCase() === "VEVENT") {
      raw.push(current);
      current = null;
    } else if (current && depth === 0) {
      current.props.push(property);
    }
  }

  // Changed single occurrences replace the series' version of that occurrence.
  const overrides = new Map<string, Set<number>>();
  for (const event of raw) {
    const recurrence = first(event, "RECURRENCE-ID");
    const uid = first(event, "UID")?.value ?? "";
    const when = recurrence ? parseWhen(recurrence) : null;
    if (when) overrides.set(uid, (overrides.get(uid) ?? new Set()).add(toInstant(when.wall, when.anchor)));
  }

  const results: CalendarEventRecord[] = [];
  for (const event of raw) {
    const start = first(event, "DTSTART");
    const when = start ? parseWhen(start) : null;
    if (!when) continue;
    const uid = first(event, "UID")?.value ?? `${start!.value}-${results.length}`;
    const cancelled = first(event, "STATUS")?.value.toUpperCase() === "CANCELLED";

    const startAt = toInstant(when.wall, when.anchor);
    const end = first(event, "DTEND");
    const endWhen = end ? parseWhen(end) : null;
    const duration = first(event, "DURATION");
    const length = endWhen
      ? toInstant(endWhen.wall, endWhen.anchor) - startAt
      : duration
        ? (parseDuration(duration.value) ?? 0)
        : when.dateOnly
          ? DAY
          : 0;

    const base = {
      title: unescapeText(first(event, "SUMMARY")?.value ?? "") || "(No title)",
      allDay: when.dateOnly,
      location: unescapeText(first(event, "LOCATION")?.value ?? ""),
      url: (first(event, "URL")?.value ?? "").trim(),
    };
    const add = (at: number, id: string) => {
      if (!cancelled && at < to && at + length > from) {
        results.push({ ...base, externalId: id, startsAt: at, endsAt: at + Math.max(length, 0) });
      }
    };

    const recurrence = first(event, "RECURRENCE-ID");
    const ruleProperty = first(event, "RRULE");
    if (recurrence || !ruleProperty) {
      add(startAt, recurrence ? `${uid}/${recurrence.value}` : uid);
      continue;
    }

    const rule = parseRule(ruleProperty.value);
    const untilWhen = rule.UNTIL ? parseWhen({ name: "UNTIL", params: {}, value: rule.UNTIL }) : null;
    const until = untilWhen ? toInstant(untilWhen.wall, untilWhen.anchor) + (untilWhen.dateOnly ? DAY - 1 : 0) : Infinity;
    const count = rule.COUNT ? Number(rule.COUNT) : Infinity;
    const excluded = new Set<number>();
    for (const exdate of event.props.filter((property) => property.name === "EXDATE")) {
      for (const value of exdate.value.split(",")) {
        const parsed = parseWhen({ ...exdate, value });
        if (parsed) excluded.add(toInstant(parsed.wall, parsed.anchor));
      }
    }
    const replaced = overrides.get(uid) ?? new Set<number>();

    let seen = 0;
    let lastAt = -Infinity;
    for (const wall of occurrences(when.wall, rule)) {
      const at = toInstant(wall, when.anchor);
      if (at <= lastAt) break; // A rule this reader does not expand: stop after the first occurrence.
      lastAt = at;
      if (at > until || at >= to || seen >= count || seen > 5000) break;
      seen++;
      if (excluded.has(at) || replaced.has(at)) continue;
      add(at, `${uid}/${at}`);
    }
  }
  return results.sort((a, b) => a.startsAt - b.startsAt);
}

/** Reads any calendar that can publish an iCalendar (.ics) address: Google, Outlook, Apple and others. */
export const icalConnector: Connector = {
  id: "ical",
  name: "Calendar feed",
  description:
    "Any calendar that can share an iCalendar (.ics) address, such as Google Calendar's secret address in iCal format, or a calendar published from Outlook or Apple Calendar. Meetings from a week ago to 30 days ahead.",
  fields: [
    {
      key: "url",
      label: "Calendar address",
      help: "Starts with https:// or webcal:// and usually ends in .ics. Treat it like a password: anyone with it can read the calendar.",
      placeholder: "https://calendar.example.com/private/basic.ics",
      required: true,
      secret: true,
    },
  ],
  async sync({ secrets, now, http }) {
    const url = secrets.url.trim().replace(/^webcal:\/\//i, "https://");
    if (!/^https:\/\//i.test(url)) throw new Error("The calendar address must start with https:// or webcal://.");
    const response = await http(url);
    if (response.status === 401 || response.status === 403) {
      throw new Error("The calendar refused the address. It may have been reset; copy it again.");
    }
    if (response.status === 404) throw new Error("No calendar at that address. Check it was copied in full.");
    if (response.status >= 400) throw new Error(`The calendar server answered with error ${response.status}.`);
    const text = await response.text();
    if (!/BEGIN:VCALENDAR/i.test(text)) throw new Error("That address did not return a calendar.");
    return { activities: [], events: parseCalendar(text, dayStart(now, PAST_DAYS), now + FUTURE_DAYS * DAY) };
  },
};
