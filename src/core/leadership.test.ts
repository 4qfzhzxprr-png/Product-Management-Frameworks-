import { describe, expect, it } from "vitest";
import { openMemoryDb } from "../platform/sqljsDb";
import {
  completeFormat,
  defaultUpdateFormat,
  draftWeeklyUpdate,
  noSurprises,
  priorityMap,
  roadmapStatus,
  shippedBetween,
  sinceLast,
  weekStart,
  type RoadmapItem,
} from "./leadership";
import type { Capture } from "./models";
import { CaptureStore } from "./store";
import type { WorkItem } from "./work";

const DAY = 86_400_000;
// Wednesday 18 November 2026, 9am local.
const NOW = new Date(2026, 10, 18, 9).getTime();

let nextId = 1;
function ticket(extra: Partial<WorkItem>): WorkItem {
  const id = nextId++;
  return {
    id, source: "c1", sourceName: "Tracker", externalId: `T-${id}`, kind: "Story", level: "item", title: `Ticket ${id}`,
    url: "", status: "todo", statusLabel: "", ownerName: "", team: "Onshore", parentExternalId: null, sprint: null,
    sprintEndsAt: null, dueAt: null, createdAt: NOW - 30 * DAY, updatedAt: NOW - DAY, waitingOnProduct: false,
    resolvedAt: null, ...extra,
  };
}
const epic = (externalId: string, extra: Partial<WorkItem> = {}) =>
  ticket({ level: "epic", kind: "Epic", externalId, title: externalId, ...extra });
const done = (parent: string, daysAgo: number, extra: Partial<WorkItem> = {}) =>
  ticket({ parentExternalId: parent, status: "done", resolvedAt: NOW - daysAgo * DAY, ...extra });

function capture(extra: Partial<Capture>): Capture {
  return {
    id: nextId++, createdAt: NOW - DAY, kind: "note", body: "x", personId: null, projectId: null,
    isWin: false, doneAt: null, dueAt: null, ...extra,
  };
}

function roadmapItem(extra: Partial<RoadmapItem>): RoadmapItem {
  return { id: nextId++, title: "Item", notes: "", committedAt: null, toLeadership: true, createdAt: NOW - 20 * DAY, epics: [], ...extra };
}
const link = (externalId: string, baselineTotal: number, linkedAt = NOW - 20 * DAY) => ({
  source: "c1", externalId, baselineTotal, linkedAt,
});

describe("weekStart", () => {
  it("is Monday midnight", () => {
    expect(weekStart(NOW)).toBe(new Date(2026, 10, 16).getTime());
    expect(weekStart(NOW, 1)).toBe(new Date(2026, 10, 9).getTime());
    expect(weekStart(new Date(2026, 10, 22, 23).getTime())).toBe(new Date(2026, 10, 16).getTime());
  });
});

describe("shippedBetween", () => {
  const work = [
    epic("B-epic", { title: "Billing" }),
    epic("A-epic", { title: "Accounts", status: "done", resolvedAt: NOW - DAY }),
    done("B-epic", 1, { title: "Invoice PDF" }),
    done("A-epic", 2, { title: "Login" }),
    done("A-epic", 9, { title: "Too old" }),
    done("B-epic", 3, { title: "Other tracker", source: "c2" }),
    ticket({ status: "in_progress", resolvedAt: null }),
  ];
  const shipped = shippedBetween(work, NOW - 7 * DAY, NOW);

  it("groups tickets finished in the period under their epics, loose ones last", () => {
    expect(shipped.groups.map((group) => [group.epic?.title ?? null, group.items.map((item) => item.title)])).toEqual([
      ["Accounts", ["Login"]],
      ["Billing", ["Invoice PDF"]],
      [null, ["Other tracker"]],
    ]);
    expect(shipped.count).toBe(3);
    expect(shipped.epicsCompleted.map((item) => item.title)).toEqual(["Accounts"]);
  });
});

describe("roadmapStatus and noSurprises", () => {
  const work = [
    epic("ON"),
    done("ON", 3),
    ticket({ parentExternalId: "ON", status: "in_progress" }),
    epic("LATE"),
    ticket({ parentExternalId: "LATE", status: "in_progress" }),
    epic("GREW"),
    done("GREW", 2),
    ...Array.from({ length: 5 }, () => ticket({ parentExternalId: "GREW", status: "in_progress" })),
    epic("STUCK"),
    ticket({ parentExternalId: "STUCK", status: "blocked" }),
    done("STUCK", 4),
    ticket({ parentExternalId: "STUCK", status: "in_progress" }),
    epic("QUIET"),
    ticket({ parentExternalId: "QUIET", status: "in_progress", updatedAt: NOW - 10 * DAY }),
    done("QUIET", 12),
    epic("SLOW"),
    ...Array.from({ length: 10 }, () => ticket({ parentExternalId: "SLOW", status: "todo" })),
    epic("FIN", { status: "done" }),
    done("FIN", 5),
    epic("NEW"),
    ticket({ parentExternalId: "NEW", status: "todo" }),
  ];
  const items = [
    roadmapItem({ title: "on track", committedAt: NOW + 20 * DAY, epics: [link("ON", 2)] }),
    roadmapItem({ title: "late", committedAt: NOW - 2 * DAY, epics: [link("LATE", 1)] }),
    roadmapItem({ title: "grew", committedAt: NOW + 30 * DAY, epics: [link("GREW", 3)] }),
    roadmapItem({ title: "stuck", committedAt: NOW + 30 * DAY, epics: [link("STUCK", 3)] }),
    roadmapItem({ title: "quiet", committedAt: NOW + 30 * DAY, epics: [link("QUIET", 2)] }),
    roadmapItem({ title: "slow", committedAt: NOW + 5 * DAY, epics: [link("SLOW", 10)] }),
    roadmapItem({ title: "finished", committedAt: NOW - 9 * DAY, epics: [link("FIN", 1)] }),
    roadmapItem({ title: "new", committedAt: NOW + 30 * DAY, epics: [link("NEW", 1, NOW - DAY)] }),
    roadmapItem({ title: "unlinked" }),
    roadmapItem({ title: "gone", epics: [link("DELETED", 1)] }),
    roadmapItem({ title: "internal", toLeadership: false, committedAt: NOW - DAY, epics: [link("LATE", 1)] }),
  ];
  const statuses = roadmapStatus(items, work, NOW);
  const byTitle = Object.fromEntries(statuses.map((status) => [status.item.title, status]));

  it("calls each item's state", () => {
    expect(Object.fromEntries(statuses.map((status) => [status.item.title, status.state]))).toEqual({
      "on track": "on_track", late: "late", grew: "at_risk", stuck: "at_risk", quiet: "at_risk", slow: "at_risk",
      finished: "done", new: "not_started", unlinked: "unlinked", gone: "unlinked", internal: "late",
    });
  });

  it("says why, in plain words", () => {
    expect(byTitle.late.reasons[0]).toMatch(/^Past the date given to leadership/);
    expect(byTitle.grew.reasons).toEqual(["Scope grew from 3 to 6 tickets since it was linked."]);
    expect(byTitle.stuck.reasons).toEqual(["STUCK has 1 ticket stuck."]);
    expect(byTitle.quiet.reasons).toEqual(["No open ticket has moved in a week."]);
    expect(byTitle.slow.reasons).toEqual(["0% done with 80% of the time gone."]);
    expect(byTitle.gone).toMatchObject({ missing: 1, reasons: ["The linked epics are no longer in the tracker."] });
    expect(byTitle["on track"]).toMatchObject({ done: 1, total: 2, reasons: [] });
  });

  it("raises only leadership commitments, late ones first", () => {
    expect(noSurprises(statuses).map((status) => status.item.title)).toEqual(["late", "slow", "grew", "stuck", "quiet"]);
  });
});

describe("priorityMap", () => {
  it("maps epics to priorities and lists open epics that serve none", () => {
    const work = [epic("A"), epic("B"), epic("C", { status: "done" }), epic("D")];
    const map = priorityMap(
      [
        { id: 1, title: "Growth", notes: "", position: 0, epics: [link("A", 0), link("GONE", 0)] },
        { id: 2, title: "Quality", notes: "", position: 1, epics: [] },
      ],
      work,
      NOW,
    );
    expect(map.priorities.map((view) => [view.priority.title, view.epics.map((entry) => entry.epic.externalId), view.missing])).toEqual([
      ["Growth", ["A"], 1],
      ["Quality", [], 0],
    ]);
    expect(map.unmapped.map((entry) => entry.epic.externalId)).toEqual(["B", "D"]);
  });
});

describe("draftWeeklyUpdate", () => {
  const work = [
    epic("E", { title: "Portal" }),
    done("E", 1, { title: "Consent screen" }),
    ticket({ parentExternalId: "E", status: "in_progress" }),
    ticket({ status: "blocked" }),
  ];
  const captures = [
    capture({ body: "Beta cut tickets by a third", isWin: true }),
    capture({ body: "Old win", isWin: true, createdAt: NOW - 20 * DAY }),
    capture({ kind: "decision", body: "Pilot with 20 pharmacies" }),
    capture({ kind: "ask_of_them", personId: 7, body: "Approve Q1 headcount" }),
    capture({ kind: "ask_of_them", personId: 8, body: "Not to the manager" }),
  ];
  const roadmap = roadmapStatus(
    [
      roadmapItem({ title: "Portal beta", committedAt: NOW + 5 * DAY, epics: [link("E", 2, NOW - 2 * DAY)] }),
      roadmapItem({ title: "Late thing", committedAt: NOW - DAY, epics: [link("E", 2)] }),
    ],
    work,
    NOW,
  );

  it("fills every section from stored data", () => {
    const text = draftWeeklyUpdate({ work, captures, roadmap, managerId: 7, now: NOW, format: defaultUpdateFormat() });
    expect(text.split("\n")[0]).toBe("Product update, week of Nov 16");
    expect(text).toContain("Shipped\n- Portal: Consent screen");
    expect(text).toContain("Wins\n- Beta cut tickets by a third\n");
    expect(text).not.toContain("Old win");
    expect(text).toContain("- Late thing: Past the date given to leadership");
    expect(text).toContain("- 1 ticket is blocked or waiting on a product answer.");
    expect(text).toContain("Decisions\n- Pilot with 20 pharmacies");
    expect(text).toContain("Coming up\n- Portal beta, due Nov 23 (on track)");
    expect(text).toContain("What I need from you\n- Approve Q1 headcount");
    expect(text).not.toContain("Not to the manager");
  });

  it("follows the chosen headings, order and sections", () => {
    const format = {
      title: "Weekly",
      sections: [
        { id: "decisions" as const, heading: "Calls made", on: true },
        { id: "shipped" as const, heading: "Done", on: false },
        { id: "asks" as const, heading: "Asks", on: true },
      ],
    };
    expect(draftWeeklyUpdate({ work, captures, roadmap, managerId: null, now: NOW, format })).toBe(
      "Weekly\n\nCalls made\n- Pilot with 20 pharmacies\n\nAsks\n- Nothing this week.",
    );
  });

  it("adds new section types to a saved format, switched off", () => {
    const saved = { title: "Mine", sections: [{ id: "wins" as const, heading: "Good news", on: true }] };
    const complete = completeFormat(saved);
    expect(complete.title).toBe("Mine");
    expect(complete.sections[0]).toEqual({ id: "wins", heading: "Good news", on: true });
    expect(complete.sections).toHaveLength(6);
    expect(complete.sections.slice(1).every((section) => !section.on)).toBe(true);
    expect(completeFormat(null)).toEqual(defaultUpdateFormat());
  });
});

describe("sinceLast", () => {
  it("counts what happened since the last 1:1, or the last week without one", () => {
    const work = [done("X", 2), done("X", 6), done("X", 12)];
    const captures = [capture({ isWin: true, createdAt: NOW - DAY }), capture({ kind: "decision", createdAt: NOW - 5 * DAY })];
    const note = capture({ kind: "one_on_one", createdAt: NOW - 3 * DAY });
    expect(sinceLast(note, work, captures, NOW)).toMatchObject({ since: note.createdAt, shipped: 1, wins: [{}], decisions: [] });
    expect(sinceLast(null, work, captures, NOW)).toMatchObject({ since: null, shipped: 2 });
    expect(sinceLast(null, work, captures, NOW).decisions).toHaveLength(1);
  });
});

describe("LeadershipStore", () => {
  it("stores priorities in order, reorders them and links epics", async () => {
    const { leadership } = await CaptureStore.open(await openMemoryDb());
    const growth = await leadership.addPriority(" Growth ");
    const quality = await leadership.addPriority("Quality");
    const cost = await leadership.addPriority("Cost");
    await leadership.movePriority(cost.id, -1);
    await leadership.movePriority(growth.id, -1);
    expect((await leadership.priorities()).map((priority) => priority.title)).toEqual(["Growth", "Cost", "Quality"]);

    await leadership.updatePriority(quality.id, { title: "Quality and trust", notes: " fewer incidents " });
    await leadership.linkEpic("priority", quality.id, { source: "c1", externalId: "E-1" }, 4, 100);
    await leadership.linkEpic("priority", quality.id, { source: "c1", externalId: "E-1" }, 9, 200);
    const stored = (await leadership.priorities()).find((priority) => priority.id === quality.id)!;
    expect(stored).toMatchObject({ title: "Quality and trust", notes: "fewer incidents" });
    expect(stored.epics).toEqual([{ source: "c1", externalId: "E-1", baselineTotal: 4, linkedAt: 100 }]);

    await leadership.deletePriority(quality.id);
    expect(await leadership.priorities()).toHaveLength(2);
    await expect(leadership.addPriority("  ")).rejects.toThrow();
  });

  it("stores roadmap items by date and keeps their links apart from priorities", async () => {
    const { leadership } = await CaptureStore.open(await openMemoryDb());
    const later = await leadership.addRoadmapItem({ title: "Later", committedAt: 500, toLeadership: true, at: 1 });
    const sooner = await leadership.addRoadmapItem({ title: "Sooner", committedAt: 300, toLeadership: false, at: 1 });
    await leadership.addRoadmapItem({ title: "Undated", committedAt: null, toLeadership: true, at: 1 });
    const priority = await leadership.addPriority("Shared id space");
    await leadership.linkEpic("roadmap", later, { source: "c1", externalId: "E-9" }, 3, 50);
    await leadership.linkEpic("priority", priority.id, { source: "c1", externalId: "E-1" }, 1, 50);

    expect((await leadership.roadmap()).map((item) => [item.title, item.toLeadership, item.epics.length])).toEqual([
      ["Sooner", false, 0],
      ["Later", true, 1],
      ["Undated", true, 0],
    ]);
    await leadership.updateRoadmapItem(sooner, { title: "Sooner, renamed", notes: "", committedAt: 900, toLeadership: true });
    await leadership.unlinkEpic("roadmap", later, { source: "c1", externalId: "E-9" });
    await leadership.deleteRoadmapItem(later);
    expect((await leadership.roadmap()).map((item) => item.title)).toEqual(["Sooner, renamed", "Undated"]);
    expect((await leadership.priorities())[0].epics).toHaveLength(1);
  });
});
