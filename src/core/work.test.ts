import { describe, expect, it } from "vitest";
import { blockers, deliveryPulse, epicHealth, epicsFor, staleItems, type WorkItem } from "./work";

const DAY = 86_400_000;
const NOW = new Date(2026, 10, 18, 9).getTime();

let nextId = 1;
function item(extra: Partial<WorkItem>): WorkItem {
  const id = nextId++;
  return {
    id,
    source: "connection-1",
    sourceName: "Tracker",
    externalId: `T-${id}`,
    kind: "Story",
    level: "item",
    title: `Item ${id}`,
    url: "",
    status: "todo",
    statusLabel: "",
    ownerName: "",
    team: "Onshore",
    parentExternalId: null,
    sprint: "Sprint 9",
    sprintEndsAt: NOW + 6 * DAY,
    dueAt: null,
    createdAt: NOW - 20 * DAY,
    updatedAt: NOW - DAY,
    waitingOnProduct: false,
    resolvedAt: null,
    ...extra,
  };
}

describe("deliveryPulse", () => {
  const items = [
    item({ status: "done" }),
    item({ status: "done" }),
    item({ status: "in_progress" }),
    item({ status: "blocked", title: "stuck", updatedAt: NOW - 3 * DAY }),
    item({ status: "in_progress", title: "needs answer", waitingOnProduct: true, updatedAt: NOW - 5 * DAY }),
    item({ status: "todo", title: "overdue", dueAt: NOW - DAY }),
    item({ team: "Offshore", status: "todo", title: "late start", sprintEndsAt: NOW + DAY }),
    item({ team: "Offshore", status: "done" }),
    item({ team: "Offshore", sprint: null, status: "blocked" }),
    item({ level: "epic", kind: "Epic" }),
  ];
  const pulse = deliveryPulse(items, NOW);

  it("counts sprint items per team, leaving out epics and items outside a sprint", () => {
    expect(pulse.map((team) => [team.team, team.total, team.done, team.inProgress, team.blocked, team.todo])).toEqual([
      ["Offshore", 2, 1, 0, 0, 1],
      ["Onshore", 6, 2, 2, 1, 1],
    ]);
  });

  it("explains what is at risk, longest untouched first", () => {
    expect(pulse[1].atRisk.map((risk) => [risk.item.title, risk.reason])).toEqual([
      ["needs answer", "Waiting on a product answer"],
      ["stuck", "Blocked"],
      ["overdue", "Past its due date"],
    ]);
    expect(pulse[0].atRisk.map((risk) => risk.reason)).toEqual(["Not started with the sprint nearly over"]);
  });
});

describe("blockers and staleItems", () => {
  const items = [
    item({ status: "blocked", title: "old block", updatedAt: NOW - 9 * DAY }),
    item({ status: "in_progress", title: "question", waitingOnProduct: true, updatedAt: NOW - 2 * DAY }),
    item({ status: "done", waitingOnProduct: true }),
    item({ status: "in_progress", title: "quiet", updatedAt: NOW - 10 * DAY }),
    item({ status: "in_progress", title: "active", updatedAt: NOW - DAY }),
    item({ status: "todo", title: "old todo", updatedAt: NOW - 30 * DAY }),
  ];

  it("lists what is blocked or waiting on product, longest stuck first", () => {
    expect(blockers(items).map((entry) => entry.title)).toEqual(["old block", "question"]);
  });

  it("lists in-progress work nobody has touched for a week", () => {
    expect(staleItems(items, NOW).map((entry) => entry.title)).toEqual(["quiet"]);
  });
});

describe("epicHealth", () => {
  const epic = (externalId: string, extra: Partial<WorkItem> = {}) =>
    item({ level: "epic", kind: "Epic", externalId, title: externalId, sprint: null, ...extra });
  const child = (parent: string, extra: Partial<WorkItem>) => item({ parentExternalId: parent, ...extra });
  const items = [
    epic("A-done", { ownerName: "Priya" }),
    child("A-done", { status: "done" }),
    epic("B-late", { ownerName: "priya ", dueAt: NOW - DAY }),
    child("B-late", { status: "in_progress" }),
    epic("C-risk", { ownerName: "Marco" }),
    child("C-risk", { status: "done" }),
    child("C-risk", { status: "blocked" }),
    epic("D-fine"),
    child("D-fine", { status: "done" }),
    child("D-fine", { status: "in_progress" }),
    epic("E-new"),
    child("E-new", { status: "todo" }),
    // Same key in another tracker must not be counted.
    child("D-fine", { source: "connection-2", status: "blocked" }),
  ];
  const health = epicHealth(items, NOW);

  it("calls each epic's health from its children and due date", () => {
    expect(health.map((entry) => [entry.epic.title, entry.health, entry.done, entry.total])).toEqual([
      ["A-done", "done", 1, 1],
      ["B-late", "off_track", 0, 1],
      ["C-risk", "at_risk", 1, 2],
      ["D-fine", "on_track", 1, 2],
      ["E-new", "not_started", 0, 1],
    ]);
  });

  it("matches epics to a person by name, ignoring case and spaces", () => {
    const priya = { id: 1, name: "Priya", isPM: true, aliases: [] };
    expect(epicsFor(priya, health).map((entry) => entry.epic.title)).toEqual(["A-done", "B-late"]);
  });
});
