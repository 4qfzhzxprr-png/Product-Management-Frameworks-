import { describe, expect, it } from "vitest";
import { openMemoryDb } from "../platform/sqljsDb";
import { defaultHandoffSettings, draftHandoffNote, handoffItems, overlap, type HandoffSettings } from "./handoff";
import type { Capture } from "./models";
import { CaptureStore } from "./store";
import type { WorkItem } from "./work";

const utc = (day: number, hour: number, minute = 0) => Date.UTC(2026, 10, day, hour, minute);
// 9:00 on Wednesday 18 November in Chicago (UTC-6 in winter).
const NOW = utc(18, 15);

const settings: HandoffSettings = {
  ...defaultHandoffSettings("America/Chicago"),
  offshoreZone: "Asia/Kolkata",
};

describe("overlap", () => {
  it("finds no shared hours between a Chicago day and a standard India day", () => {
    const result = overlap(settings, NOW);
    expect(result.window).toBeNull();
    expect(result.myDayEndsAt).toBe(utc(18, 23, 30));
    // 09:30 in Kolkata (UTC+5:30) is 04:00 UTC.
    expect(result.offshoreStartsAt).toBe(utc(19, 4));
    expect(result.offshoreWorkingNow).toBe(false);
  });

  it("finds the shared window when the offshore team works a late shift", () => {
    const late = { ...settings, offshoreStart: "13:00", offshoreEnd: "22:00" };
    const result = overlap(late, NOW);
    // Their day is 07:30 to 16:30 UTC; mine is 15:00 to 23:30 UTC.
    expect(result.window).toEqual([utc(18, 15), utc(18, 16, 30)]);
    expect(result.offshoreWorkingNow).toBe(true);
  });

  it("handles an offshore shift that runs past midnight", () => {
    const night = { ...settings, offshoreStart: "18:00", offshoreEnd: "03:00" };
    // 18:00 to 03:00 in Kolkata is 12:30 to 21:30 UTC.
    expect(overlap(night, NOW).window).toEqual([utc(18, 15), utc(18, 21, 30)]);
  });
});

describe("handoffItems and the draft note", () => {
  const work = (extra: Partial<WorkItem>): WorkItem => ({
    id: 1, source: "c", sourceName: "Tracker", externalId: "T-1", kind: "Story", level: "item", title: "Thing",
    url: "", status: "blocked", statusLabel: "", ownerName: "", team: "Offshore", parentExternalId: null,
    sprint: null, sprintEndsAt: null, dueAt: null, createdAt: 0, updatedAt: NOW, resolvedAt: null, waitingOnProduct: true, ...extra,
  });
  const capture = (extra: Partial<Capture>): Capture => ({
    id: 1, createdAt: NOW - 1000, kind: "commitment", body: "x", personId: null, projectId: null,
    isWin: false, doneAt: null, dueAt: null, ...extra,
  });
  const items = handoffItems(
    [
      work({ externalId: "REF-22", title: "SMS template", updatedAt: NOW - 5000 }),
      work({ externalId: "REF-9", title: "Older question", updatedAt: NOW - 9000 }),
      work({ externalId: "PORT-3", team: "Onshore" }),
      work({ externalId: "REF-30", status: "done" }),
      work({ externalId: "REF-31", waitingOnProduct: false }),
    ],
    [
      capture({ body: "send the spec", dueAt: NOW - 86_400_000 * 2 }),
      capture({ body: "no date" }),
      capture({ body: "estimate please", kind: "ask_of_them" }),
    ],
    settings,
    NOW,
  );

  it("picks offshore tickets waiting on product, late promises and open asks", () => {
    expect(items.answers.map((item) => item.externalId)).toEqual(["REF-9", "REF-22"]);
    expect(items.promised.map((entry) => entry.body)).toEqual(["send the spec"]);
    expect(items.asks.map((entry) => entry.body)).toEqual(["estimate please"]);
  });

  it("drafts a note with a line for each", () => {
    const note = draftHandoffNote(items, NOW);
    expect(note).toContain("- REF-9 Older question: [your answer]");
    expect(note).toContain("- estimate please");
    expect(note).toContain("- send the spec: [update]");
    expect(draftHandoffNote({ answers: [], promised: [], asks: [] }, NOW)).toContain(
      "- Nothing is waiting on a product answer.",
    );
  });
});

describe("SettingsStore", () => {
  it("saves and replaces a setting", async () => {
    const store = await CaptureStore.open(await openMemoryDb());
    expect(await store.settings.get("handoff")).toBeNull();
    await store.settings.set("handoff", settings);
    await store.settings.set("handoff", { ...settings, offshoreTeam: "Pune" });
    expect(await store.settings.get<HandoffSettings>("handoff")).toMatchObject({ offshoreTeam: "Pune", myStart: "09:00" });
  });
});
