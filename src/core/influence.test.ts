import { describe, expect, it } from "vitest";
import { openMemoryDb } from "../platform/sqljsDb";
import {
  buildPreread,
  exportNarrative,
  narrativeBank,
  prereadGaps,
  stakeholderMap,
  storyType,
  wordCount,
  type PrereadFields,
} from "./influence";
import type { Capture } from "./models";
import { CaptureStore } from "./store";

const DAY = 86_400_000;
const NOW = new Date(2026, 10, 18, 9).getTime();

let nextId = 1;
function capture(extra: Partial<Capture>): Capture {
  return {
    id: nextId++, createdAt: NOW - DAY, kind: "note", body: `entry ${nextId}`, personId: null, projectId: null,
    isWin: false, doneAt: null, dueAt: null, ...extra,
  };
}

describe("narrative bank", () => {
  const entries = [
    capture({ body: "Beta cut tickets", isWin: true, projectId: 1, createdAt: NOW - 2 * DAY }),
    capture({ kind: "evidence", body: "Pharmacist quote", projectId: 2, createdAt: NOW - 40 * DAY }),
    capture({ kind: "metric", body: "Tickets down 33%", projectId: 1, createdAt: NOW - DAY }),
    capture({ kind: "metric", body: "Starred metric", isWin: true, createdAt: NOW - 5 * DAY }),
    capture({ kind: "note", body: "Plain note" }),
  ];

  it("classifies captures, with the kind winning over the star", () => {
    expect(entries.map(storyType)).toEqual(["win", "evidence", "metric", "metric", null]);
  });

  it("filters by type, project and period, newest first", () => {
    expect(narrativeBank(entries, {}, NOW).map((entry) => entry.body)).toEqual([
      "Tickets down 33%", "Beta cut tickets", "Starred metric", "Pharmacist quote",
    ]);
    expect(narrativeBank(entries, { type: "metric" }, NOW)).toHaveLength(2);
    expect(narrativeBank(entries, { projectId: 1 }, NOW)).toHaveLength(2);
    expect(narrativeBank(entries, { days: 30 }, NOW).map((entry) => entry.body)).not.toContain("Pharmacist quote");
  });

  it("exports plain text grouped by project, with unfiled entries last", () => {
    const text = exportNarrative(narrativeBank(entries, {}, NOW), [
      { id: 1, name: "Portal" },
      { id: 2, name: "Clinics" },
    ]);
    expect(text.split("\n\n").map((block) => block.split("\n")[0])).toEqual(["Clinics", "Portal", "General"]);
    expect(text).toContain("Portal\n- Metric: Tickets down 33% (Nov 17, 2026)\n- Win: Beta cut tickets (Nov 16, 2026)");
  });
});

describe("stakeholderMap", () => {
  const people = [
    { id: 1, name: "Morgan", isPM: false },
    { id: 2, name: "Taylor", isPM: false },
    { id: 3, name: "Gone", isPM: false },
  ];
  const profile = (personId: number, title: string) => ({ personId, title, goals: "", concerns: "", updatedAt: 0 });
  const map = stakeholderMap(
    [profile(1, "CFO"), profile(2, "CEO"), profile(99, "Deleted person")],
    people,
    [
      capture({ kind: "ask_of_me", personId: 1, body: "Cost per pharmacy", createdAt: NOW - 12 * DAY }),
      capture({ kind: "ask_of_me", personId: 1, body: "Margin forecast", createdAt: NOW - 3 * DAY, doneAt: NOW - DAY }),
      capture({ kind: "note", personId: 2, createdAt: NOW - 45 * DAY }),
    ],
    NOW,
  );

  it("shows what each executive last asked for, what is still open and when they were last in touch", () => {
    expect(map.map((entry) => entry.person.name)).toEqual(["Morgan", "Taylor"]);
    expect(map[0]).toMatchObject({ lastAsk: { body: "Margin forecast" }, quiet: false, lastContactAt: NOW - 3 * DAY });
    expect(map[0].openAsks.map((ask) => ask.body)).toEqual(["Cost per pharmacy"]);
    expect(map[1]).toMatchObject({ lastAsk: null, openAsks: [], quiet: true });
  });
});

describe("pre-reads", () => {
  const fields: PrereadFields = {
    title: "Expand the refill pilot",
    personId: 1,
    ask: "Approve budget for 100 pharmacies.",
    whyNow: "The pilot ends in two weeks.",
    background: "",
    options: "1. Expand now\n2. Wait a quarter",
    recommendation: "Expand now.",
    evidenceIds: [11, 404],
  };
  const audience = {
    person: { id: 1, name: "Morgan", isPM: false },
    profile: { personId: 1, title: "CFO", goals: "", concerns: "", updatedAt: 0 },
    lastAsk: null, openAsks: [], lastContactAt: null, quiet: true,
  };
  const evidence = [capture({ id: 11, kind: "metric", body: "Tickets down 33%" })];

  it("puts the ask first, leaves out empty sections and quotes chosen evidence", () => {
    const text = buildPreread(fields, { audience, evidence, now: NOW });
    expect(text.split("\n").slice(0, 5)).toEqual([
      "Pre-read: Expand the refill pilot",
      "For Morgan, CFO · Nov 18, 2026",
      "",
      "The ask",
      "Approve budget for 100 pharmacies.",
    ]);
    expect(text).not.toContain("Background");
    expect(text).toContain("Options\n1. Expand now\n2. Wait a quarter");
    expect(text.endsWith("Evidence\n- Tickets down 33%")).toBe(true);
  });

  it("says what is missing and counts words", () => {
    expect(prereadGaps(fields)).toEqual([]);
    expect(prereadGaps({ ...fields, ask: " ", personId: null, recommendation: "" })).toHaveLength(3);
    expect(wordCount("  one two\nthree ")).toBe(3);
  });
});

describe("InfluenceStore", () => {
  it("keeps stakeholder profiles and drops them with the person", async () => {
    const store = await CaptureStore.open(await openMemoryDb());
    const morgan = await store.addPerson("Morgan");
    await store.influence.saveStakeholder(morgan.id, { title: " CFO ", goals: "Margin", concerns: "" }, 5);
    await store.influence.saveStakeholder(morgan.id, { title: "CFO", goals: "Margin and cash", concerns: "Burn" }, 6);
    expect(await store.influence.stakeholders()).toEqual([
      { personId: morgan.id, title: "CFO", goals: "Margin and cash", concerns: "Burn", updatedAt: 6 },
    ]);
    const id = await store.influence.createPreread("Budget ask", morgan.id, 7);
    await store.deletePerson(morgan.id);
    expect(await store.influence.stakeholders()).toEqual([]);
    expect((await store.influence.prereads())[0]).toMatchObject({ id, personId: null });
  });

  it("creates, saves and deletes pre-reads, most recent first", async () => {
    const { influence } = await CaptureStore.open(await openMemoryDb());
    const first = await influence.createPreread("First", null, 1);
    const second = await influence.createPreread("Second", null, 2);
    await influence.savePreread(
      first,
      { title: "First, revised", personId: null, ask: "Yes?", whyNow: "", background: "", options: "", recommendation: "", evidenceIds: [3, 4] },
      3,
    );
    expect((await influence.prereads()).map((entry) => [entry.title, entry.evidenceIds])).toEqual([
      ["First, revised", [3, 4]],
      ["Second", []],
    ]);
    await influence.deletePreread(second);
    expect(await influence.prereads()).toHaveLength(1);
    await expect(influence.createPreread(" ", null)).rejects.toThrow();
  });
});
