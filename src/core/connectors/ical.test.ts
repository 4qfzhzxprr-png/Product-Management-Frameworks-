import { describe, expect, it } from "vitest";
import { openMemoryDb } from "../../platform/sqljsDb";
import { freeSlots } from "../calendar";
import { ConnectorRegistry, MemorySecretStore, syncAll, type HttpClient } from "../connectors";
import { CaptureStore } from "../store";
import { icalConnector, parseCalendar } from "./ical";

const utc = (month: number, day: number, hour = 0, minute = 0) => Date.UTC(2026, month - 1, day, hour, minute);
const FROM = utc(11, 1);
const TO = utc(12, 31);

function feed(...events: string[]): string {
  return ["BEGIN:VCALENDAR", "VERSION:2.0", ...events.flatMap((event) => ["BEGIN:VEVENT", event, "END:VEVENT"]), "END:VCALENDAR"].join("\r\n");
}

describe("parseCalendar", () => {
  it("reads UTC, time-zoned, Windows-zoned and all-day events, with folded and escaped text", () => {
    const events = parseCalendar(
      feed(
        "UID:a\nDTSTART:20261117T150000Z\nDTEND:20261117T153000Z\nSUMMARY:Stand-up\\, offshore\nLOCATION:Room 4\;B",
        "UID:b\nDTSTART;TZID=America/Chicago:20261118T090000\nDURATION:PT1H30M\nSUMMARY:Roadmap revi\n ew",
        "UID:c\nDTSTART;TZID=India Standard Time:20261119T190000\nDTEND;TZID=India Standard Time:20261119T200000\nSUMMARY:Handoff",
        "UID:d\nDTSTART;VALUE=DATE:20261120\nDTEND;VALUE=DATE:20261121\nSUMMARY:Offsite",
      ).replace(/\n/g, "\r\n"),
      FROM,
      TO,
    );
    expect(events.map((event) => [event.title, event.startsAt, event.endsAt, event.allDay, event.location])).toEqual([
      ["Stand-up, offshore", utc(11, 17, 15), utc(11, 17, 15, 30), false, "Room 4;B"],
      // 9:00 in Chicago in November is 15:00 UTC.
      ["Roadmap review", utc(11, 18, 15), utc(11, 18, 16, 30), false, ""],
      // 19:00 in India is 13:30 UTC.
      ["Handoff", utc(11, 19, 13, 30), utc(11, 19, 14, 30), false, ""],
      ["Offsite", new Date(2026, 10, 20).getTime(), new Date(2026, 10, 21).getTime(), true, ""],
    ]);
  });

  it("expands weekly meetings across a clock change, keeping the local time", () => {
    // Tuesdays and Thursdays at 10:00 in New York, from late October into November.
    const events = parseCalendar(
      feed("UID:w\nDTSTART;TZID=America/New_York:20261027T100000\nDTEND;TZID=America/New_York:20261027T103000\nRRULE:FREQ=WEEKLY;BYDAY=TU,TH;COUNT=4\nSUMMARY:1:1"),
      utc(10, 1),
      TO,
    );
    // Daylight saving ends on 1 November: 10:00 is 14:00 UTC before and 15:00 UTC after.
    expect(events.map((event) => event.startsAt)).toEqual([utc(10, 27, 14), utc(10, 29, 14), utc(11, 3, 15), utc(11, 5, 15)]);
    expect(new Set(events.map((event) => event.externalId)).size).toBe(4);
  });

  it("honours UNTIL, INTERVAL, EXDATE, moved occurrences and cancellations", () => {
    const events = parseCalendar(
      feed(
        "UID:s\nDTSTART:20261102T160000Z\nDTEND:20261102T163000Z\nRRULE:FREQ=WEEKLY;INTERVAL=2;UNTIL=20261231T000000Z\nEXDATE:20261116T160000Z\nSUMMARY:Planning",
        "UID:s\nRECURRENCE-ID:20261130T160000Z\nDTSTART:20261201T170000Z\nDTEND:20261201T173000Z\nSUMMARY:Planning (moved)",
        "UID:x\nDTSTART:20261110T120000Z\nDTEND:20261110T130000Z\nSTATUS:CANCELLED\nSUMMARY:Gone",
        "UID:m\nDTSTART:20261105T090000Z\nRRULE:FREQ=MONTHLY;COUNT=3\nDURATION:PT1H\nSUMMARY:Monthly",
        "UID:n\nDTSTART:20261103T090000Z\nRRULE:FREQ=MONTHLY;BYDAY=1TU\nDURATION:PT1H\nSUMMARY:Unsupported rule",
      ),
      FROM,
      TO,
    );
    const titled = (title: string) => events.filter((event) => event.title === title).map((event) => event.startsAt);
    expect(titled("Planning")).toEqual([utc(11, 2, 16), utc(11, 30, 16), utc(12, 14, 16), utc(12, 28, 16)].filter((at) => at !== utc(11, 30, 16)));
    expect(titled("Planning (moved)")).toEqual([utc(12, 1, 17)]);
    expect(titled("Gone")).toEqual([]);
    expect(titled("Monthly")).toEqual([utc(11, 5, 9), utc(12, 5, 9)]);
    // A rule this reader cannot expand still shows its first meeting.
    expect(titled("Unsupported rule")).toEqual([utc(11, 3, 9)]);
  });

  it("keeps only meetings that overlap the window, and ignores alarms inside events", () => {
    const events = parseCalendar(
      feed(
        "UID:old\nDTSTART:20260101T090000Z\nDTEND:20260101T100000Z\nSUMMARY:Too early",
        "UID:daily\nDTSTART:20261029T090000Z\nDTEND:20261029T091500Z\nRRULE:FREQ=DAILY\nSUMMARY:Daily\nBEGIN:VALARM\nSUMMARY:Alarm text\nEND:VALARM",
      ),
      utc(11, 1),
      utc(11, 4),
    );
    expect(events.map((event) => [event.title, event.startsAt])).toEqual([
      ["Daily", utc(11, 1, 9)],
      ["Daily", utc(11, 2, 9)],
      ["Daily", utc(11, 3, 9)],
    ]);
  });
});

describe("freeSlots", () => {
  it("subtracts timed meetings from a window, ignoring all-day events", () => {
    const meeting = (start: number, end: number, allDay = false) => ({
      externalId: "", title: "", location: "", url: "", startsAt: start, endsAt: end, allDay,
    });
    expect(freeSlots([0, 100], [meeting(10, 20), meeting(15, 30), meeting(50, 120), meeting(0, 100, true)])).toEqual([
      [0, 10],
      [30, 50],
    ]);
    expect(freeSlots([0, 100], [])).toEqual([[0, 100]]);
  });
});

describe("the calendar connector, end to end", () => {
  const NOW = utc(11, 17, 12);
  const body = feed(
    "UID:a\nDTSTART:20261117T150000Z\nDTEND:20261117T153000Z\nSUMMARY:Stand-up",
    "UID:b\nDTSTART:20261118T150000Z\nDTEND:20261118T160000Z\nSUMMARY:Review",
  );

  async function setup(respond: (url: string) => { status: number; body: string }) {
    const store = await CaptureStore.open(await openMemoryDb());
    const secrets = new MemorySecretStore();
    const requested: string[] = [];
    const http: HttpClient = async (url) => {
      requested.push(url);
      const reply = respond(url);
      return { status: reply.status, text: async () => reply.body };
    };
    const sync = () =>
      syncAll({
        registry: new ConnectorRegistry().register(icalConnector),
        connections: store.connections, items: store.items, work: store.work, calendar: store.calendar,
        secrets, http, now: () => NOW,
      });
    return { store, secrets, requested, sync };
  }

  it("fetches the secret address, stores the meetings, and replaces them on the next sync", async () => {
    let reply = body;
    const { store, secrets, requested, sync } = await setup(() => ({ status: 200, body: reply }));
    const connection = await store.connections.add("ical", "Work calendar");
    await secrets.set(connection.id, { url: "webcal://cal.example/private.ics" });

    expect((await sync())[0]).toMatchObject({ received: 2, error: null });
    expect(requested).toEqual(["https://cal.example/private.ics"]);
    expect((await store.calendar.between(utc(11, 17), utc(11, 19))).map((event) => [event.title, event.sourceName])).toEqual([
      ["Stand-up", "Work calendar"],
      ["Review", "Work calendar"],
    ]);

    reply = feed("UID:a\nDTSTART:20261117T150000Z\nDTEND:20261117T153000Z\nSUMMARY:Stand-up");
    await sync();
    expect(await store.calendar.between(utc(11, 17), utc(11, 19))).toHaveLength(1);

    // The address lives with the secrets, never in the database.
    expect(JSON.stringify(await store.connections.list())).not.toContain("cal.example");
    await store.connections.remove(connection.id);
    expect(await store.calendar.between(0, Infinity)).toEqual([]);
  });

  it("explains failures in plain words", async () => {
    const cases: [string, number, string, RegExp][] = [
      ["http://insecure.example/cal.ics", 200, body, /must start with https/],
      ["https://cal.example/gone.ics", 404, "", /No calendar at that address/],
      ["https://cal.example/reset.ics", 403, "", /refused the address/],
      ["https://cal.example/page", 200, "<html>Sign in</html>", /did not return a calendar/],
    ];
    for (const [url, status, reply, error] of cases) {
      const { store, secrets, sync } = await setup(() => ({ status, body: reply }));
      const connection = await store.connections.add("ical", "Calendar");
      await secrets.set(connection.id, { url });
      expect((await sync())[0].error).toMatch(error);
    }
  });
});
