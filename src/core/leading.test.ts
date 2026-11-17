import { describe, expect, it } from "vitest";
import { openMemoryDb } from "../platform/sqljsDb";
import { daysSincePraise, describeTimeOff, offDuring, oneOnOneCadence, reviewPacket, reviewPacketText, workingDays } from "./leading";
import type { Capture, Person } from "./models";
import { CaptureStore } from "./store";

const local = (month: number, day: number, hour = 9) => new Date(2026, month, day, hour).getTime();
const now = local(10, 17);
const priya: Person = { id: 1, name: "Priya", isPM: true, aliases: [] };
const marco: Person = { id: 2, name: "Marco", isPM: true, aliases: [] };
let next = 1;
const capture = (body: string, kind: Capture["kind"], extra: Partial<Capture> = {}): Capture => ({
  id: next++, createdAt: now, kind, body, personId: null, projectId: null, isWin: false, doneAt: null, dueAt: null, ...extra,
});

describe("1:1 cadence", () => {
  it("flags a PM with no recent 1:1 and nothing booked soon", () => {
    const captures = [capture("Talked about discovery", "one_on_one", { personId: 1, createdAt: local(10, 10) }), capture("Old", "one_on_one", { personId: 2, createdAt: local(9, 20) })];
    const meetings = [{ externalId: "m", title: "Marco 1:1", startsAt: local(10, 18, 14), endsAt: local(10, 18, 15), allDay: false, location: "", url: "" }];
    const [p, m] = oneOnOneCadence([priya, marco], captures, [], now);
    expect(p).toMatchObject({ daysSince: 7, overdue: false });
    expect(m).toMatchObject({ daysSince: 28, overdue: true });
    // A 1:1 booked for tomorrow is enough.
    expect(oneOnOneCadence([marco], captures, meetings, now)[0].overdue).toBe(false);
    expect(oneOnOneCadence([{ ...priya, id: 9 }], captures, [], now)[0]).toMatchObject({ lastOneOnOne: null, overdue: true });
  });

  it("knows how long since someone was praised", () => {
    const captures = [capture("Great demo", "feedback", { personId: 1, isWin: true, createdAt: local(9, 30) })];
    expect(daysSincePraise(priya, captures, now)).toBe(18);
    expect(daysSincePraise(marco, captures, now)).toBeNull();
  });
});

describe("review prep", () => {
  it("gathers a period's wins, feedback, delivery and 1:1s, and writes them out", () => {
    const captures = [
      capture("Led the portal beta launch", "note", { personId: 1, isWin: true, createdAt: local(9, 1) }),
      capture("Push back earlier on scope", "feedback", { personId: 1, createdAt: local(8, 15) }),
      capture("Discovery plan", "ask_of_them", { personId: 1, doneAt: local(9, 5), createdAt: local(9, 1) }),
      capture("Hiring plan", "ask_of_them", { personId: 1, createdAt: local(10, 1) }),
      capture("Too old", "note", { personId: 1, isWin: true, createdAt: local(1, 1) }),
      capture("Someone else's", "note", { personId: 2, isWin: true }),
    ];
    const packet = reviewPacket(priya, captures, [], now, 6);
    expect(packet.wins.map((entry) => entry.body)).toEqual(["Led the portal beta launch"]);
    expect(packet.feedback.map((entry) => entry.body)).toEqual(["Push back earlier on scope"]);
    expect(packet.delivered.map((entry) => entry.body)).toEqual(["Discovery plan"]);
    expect(packet.open.map((entry) => entry.body)).toEqual(["Hiring plan"]);
    const text = reviewPacketText(packet);
    expect(text.startsWith("Priya: May 17, 2026 to Nov 17, 2026")).toBe(true);
    expect(text).toContain("Wins and praise\n- Oct 1, 2026: Led the portal beta launch");
    expect(text).toContain("Epics they own\n- None in the tracker.");
  });
});

describe("time off", () => {
  it("is stored, described and found by period", async () => {
    const store = await CaptureStore.open(await openMemoryDb());
    const person = await store.addPerson("Priya", true);
    await store.timeOff.add({ personId: person.id, team: "", startsAt: local(10, 24), endsAt: local(10, 28, 23), note: "Thanksgiving week" });
    await store.timeOff.add({ personId: null, team: "Offshore", startsAt: local(11, 25), endsAt: local(11, 25, 23), note: "" });
    await expect(store.timeOff.add({ personId: null, team: "x", startsAt: local(10, 2), endsAt: local(10, 1), note: "" })).rejects.toThrow();
    const entries = await store.timeOff.list();
    expect(describeTimeOff(entries[0], [person])).toMatch(/^Priya: Nov 24 to Nov 28 · Thanksgiving week$/);
    expect(describeTimeOff(entries[1], [])).toBe("Offshore (holiday): Dec 25");
    expect(offDuring(entries, local(10, 20), local(10, 25)).map((entry) => entry.note)).toEqual(["Thanksgiving week"]);
    expect(workingDays(local(10, 24), local(10, 28, 23))).toBe(4);
    await store.deletePerson(person.id);
    expect((await store.timeOff.list()).length).toBe(1);
  });
});
