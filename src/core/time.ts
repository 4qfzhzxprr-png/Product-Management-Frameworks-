/** A date and time as a clock on the wall shows it. */
export interface Wall {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

/** The date and time a clock on the wall in `zone` shows at the instant `at`. */
export function wallTime(zone: string, at: number): Wall {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
  }).formatToParts(at);
  const part = (type: string) => Number(parts.find((entry) => entry.type === type)?.value ?? 0);
  return { year: part("year"), month: part("month"), day: part("day"), hour: part("hour"), minute: part("minute") };
}

/** The instant at which a wall clock in `zone` shows this date and time. */
export function instant(zone: string, wall: Wall): number {
  const asUtc = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute);
  const offsetAt = (time: number) => {
    const shown = wallTime(zone, time);
    return Date.UTC(shown.year, shown.month - 1, shown.day, shown.hour, shown.minute) - time;
  };
  // Two passes settle the offset on days when the clocks change.
  const first = asUtc - offsetAt(asUtc);
  return asUtc - offsetAt(first);
}

