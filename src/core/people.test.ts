import { describe, expect, it } from "vitest";
import { openMemoryDb } from "../platform/sqljsDb";
import { nextMeetingWith } from "./calendar";
import { isMentioned, isNamed } from "./models";
import { CaptureStore } from "./store";
import { epicHealth, epicsFor, type WorkItem } from "./work";

const priya = { id: 1, name: "Priya Sharma", isPM: true, aliases: ["Priya S.", "psharma"] };

describe("other names", () => {
  it("matches a person by any of their names, ignoring case and spaces", () => {
    expect(isNamed(priya, " priya s. ")).toBe(true);
    expect(isNamed(priya, "PSHARMA")).toBe(true);
    expect(isNamed(priya, "Priya")).toBe(false);
  });

  it("finds a name as whole words in a title", () => {
    expect(isMentioned(priya, "Priya Sharma / David 1:1")).toBe(true);
    expect(isMentioned(priya, "1:1 with psharma")).toBe(true);
    expect(isMentioned({ name: "Al", aliases: [] }, "Alignment review")).toBe(false);
    expect(isMentioned({ name: "Al", aliases: [] }, "Sync with Al (offshore)")).toBe(true);
  });

  it("matches epics owned under another name", () => {
    const epic = (externalId: string, ownerName: string): WorkItem => ({
      id: Number(externalId.slice(2)), source: "c", sourceName: "", externalId, kind: "Epic", level: "epic", title: externalId,
      url: "", status: "in_progress", statusLabel: "", ownerName, team: "", parentExternalId: null, sprint: null,
      sprintEndsAt: null, dueAt: null, createdAt: 0, updatedAt: 0, waitingOnProduct: false, resolvedAt: null,
    });
    const health = epicHealth([epic("E-1", "Priya S."), epic("E-2", "Priya Sharma"), epic("E-3", "Marco")], 0);
    expect(epicsFor(priya, health).map((entry) => entry.epic.externalId)).toEqual(["E-1", "E-2"]);
  });

  it("stores other names, dropping blanks and repeats", async () => {
    const store = await CaptureStore.open(await openMemoryDb());
    const person = await store.addPerson("Priya Sharma", true);
    expect(person.aliases).toEqual([]);
    await store.setAliases(person.id, [" Priya S. ", "", "priya s.", "psharma"]);
    expect((await store.people())[0]).toMatchObject({ name: "Priya Sharma", aliases: ["Priya S.", "psharma"] });
    await store.setAliases(person.id, []);
    expect((await store.people())[0].aliases).toEqual([]);
  });
});

describe("nextMeetingWith", () => {
  const meeting = (title: string, startsAt: number, allDay = false) => ({
    externalId: title, title, startsAt, endsAt: startsAt + 30, allDay, location: "", url: "",
  });

  it("prefers the next 1:1 that names the person, and falls back to any meeting naming them", () => {
    const events = [
      meeting("Roadmap review with Priya Sharma", 100),
      meeting("Priya S. / David 1:1", 300),
      meeting("Priya Sharma 1:1", 50),
      meeting("Offsite: Priya Sharma", 200, true),
      meeting("Marco 1:1", 150),
    ];
    // The 1:1 at 50 ended at 80, before now, so the next 1:1 is the one at 300.
    expect(nextMeetingWith(priya, events, 90)?.title).toBe("Priya S. / David 1:1");
    expect(nextMeetingWith(priya, events.slice(0, 1), 0)?.title).toBe("Roadmap review with Priya Sharma");
    expect(nextMeetingWith({ name: "Sam", aliases: [] }, events, 0)).toBeNull();
  });
});
