import { describe, expect, it } from "vitest";
import { openMemoryDb } from "../../platform/sqljsDb";
import { ConnectorRegistry, MemorySecretStore, syncAll } from "../connectors";
import { CaptureStore } from "../store";
import { blockers, deliveryPulse, epicHealth } from "../work";
import { buildRecords, detectColumns, mapStatus, parseCsv, parseDate, ticketFileConnector } from "./ticketFile";

const NOW = new Date(2026, 10, 18, 9).getTime();

// Shaped like a Jira Cloud "all fields" export: Issue id, Parent as a number, two Sprint columns.
const JIRA = [
  "Summary,Issue key,Issue id,Issue Type,Status,Status Category,Assignee,Team,Parent,Sprint,Sprint,Due date,Created,Updated,Resolved",
  'Refill flow pilot,REF-1,10001,Epic,In Progress,In Progress,Marco,,,,,,01/Oct/26 9:00 AM,15/Nov/26 4:00 PM,',
  '"Reminder service, v2",REF-21,10021,Story,Done,Done,Lena,Offshore,10001,Sprint 23,Sprint 24,,03/Oct/26 9:00 AM,16/Nov/26 2:30 PM,16/Nov/26 2:30 PM',
  'SMS template,REF-22,10022,Story,Waiting for Product,To Do,Lena,Offshore,10001,Sprint 24,,,03/Oct/26 9:00 AM,12/Nov/26 10:00 AM,',
  '"Pause control ""v1""",REF-24,10024,Story,Code Review,In Progress,Sam,Offshore,10001,Sprint 24,,20/Nov/26,05/Oct/26 9:00 AM,17/Nov/26 9:00 AM,',
  ',REF-99,10099,Story,To Do,To Do,,,,,,,,,',
].join("\r\n");

describe("parseCsv", () => {
  it("handles quotes, doubled quotes, commas and line breaks inside quotes, and a byte-order mark", () => {
    expect(parseCsv('﻿a,b,c\n1,"two, 2","say ""hi"""\n"multi\nline",x,\n\n')).toEqual([
      ["a", "b", "c"],
      ["1", "two, 2", 'say "hi"'],
      ["multi\nline", "x", ""],
    ]);
  });

  it("detects semicolon and tab separated files", () => {
    expect(parseCsv("a;b\n1;2")).toEqual([["a", "b"], ["1", "2"]]);
    expect(parseCsv("a\tb\n1\t2")).toEqual([["a", "b"], ["1", "2"]]);
  });
});

describe("detectColumns", () => {
  it("finds Jira's columns, preferring the issue key over the numeric id", () => {
    const columns = detectColumns(parseCsv(JIRA)[0]);
    expect(columns).toMatchObject({
      title: 0, key: 1, internalId: 2, kind: 3, status: 4, statusCategory: 5, owner: 6, team: 7, parent: 8,
      sprint: 9, due: 11, created: 12, updated: 13, resolved: 14,
    });
  });

  it("finds Linear-style and Asana-style names", () => {
    expect(detectColumns(["ID", "Title", "Status", "Assignee", "Cycle", "Completed"])).toMatchObject({
      key: 0, title: 1, status: 2, owner: 3, sprint: 4, resolved: 5,
    });
    expect(detectColumns(["Task ID", "Name", "Section/Column", "Assignee", "Due Date"])).toMatchObject({
      key: 0, title: 1, status: -1, due: 4,
    });
  });
});

describe("mapStatus and parseDate", () => {
  it("maps status names and categories onto the app's four states", () => {
    expect(mapStatus("Done")).toEqual({ status: "done", waitingOnProduct: false });
    expect(mapStatus("Won't Do")).toMatchObject({ status: "done" });
    expect(mapStatus("Ready for release", "Done")).toMatchObject({ status: "done" });
    expect(mapStatus("Waiting for Product")).toEqual({ status: "blocked", waitingOnProduct: true });
    expect(mapStatus("Needs clarification")).toEqual({ status: "blocked", waitingOnProduct: true });
    expect(mapStatus("Blocked")).toEqual({ status: "blocked", waitingOnProduct: false });
    expect(mapStatus("In QA")).toMatchObject({ status: "in_progress" });
    expect(mapStatus("Selected", "In Progress")).toMatchObject({ status: "in_progress" });
    expect(mapStatus("Backlog")).toMatchObject({ status: "todo" });
  });

  it("reads the date formats trackers export", () => {
    const local = (y: number, m: number, d: number, h = 0, mi = 0) => new Date(y, m - 1, d, h, mi).getTime();
    expect(parseDate("2026-11-17")).toBe(local(2026, 11, 17));
    expect(parseDate("2026-11-17T15:30:00.000Z")).toBe(Date.UTC(2026, 10, 17, 15, 30));
    expect(parseDate("2026-11-17T09:30:00.000-0600")).toBe(Date.UTC(2026, 10, 17, 15, 30));
    expect(parseDate("17/Nov/26 2:30 PM")).toBe(local(2026, 11, 17, 14, 30));
    expect(parseDate("17/Nov/26 12:05 AM")).toBe(local(2026, 11, 17, 0, 5));
    expect(parseDate("11/17/2026")).toBe(local(2026, 11, 17));
    expect(parseDate("11/17/26, 9:15 AM")).toBe(local(2026, 11, 17, 9, 15));
    expect(parseDate("Nov 17, 2026")).toBe(local(2026, 11, 17));
    expect(parseDate("17 November 2026")).toBe(local(2026, 11, 17));
    expect(parseDate("")).toBeNull();
    expect(parseDate("next Tuesday")).toBeNull();
  });
});

describe("buildRecords", () => {
  const rows = parseCsv(JIRA);
  const result = buildRecords(rows, {
    columns: detectColumns(rows[0]),
    linkPattern: "https://acme.atlassian.net/browse/{key}",
    now: NOW,
  });
  const byKey = Object.fromEntries(result.records.map((record) => [record.externalId, record]));

  it("turns rows into tickets, resolving numeric parents and taking the latest sprint", () => {
    expect(result.records.map((record) => record.externalId)).toEqual(["REF-1", "REF-21", "REF-22", "REF-24"]);
    expect(byKey["REF-1"]).toMatchObject({ level: "epic", status: "in_progress", ownerName: "Marco", parentExternalId: null });
    expect(byKey["REF-21"]).toMatchObject({
      title: "Reminder service, v2", parentExternalId: "REF-1", sprint: "Sprint 24", status: "done", team: "Offshore",
      resolvedAt: new Date(2026, 10, 16, 14, 30).getTime(), url: "https://acme.atlassian.net/browse/REF-21",
    });
    expect(byKey["REF-22"]).toMatchObject({ status: "blocked", waitingOnProduct: true, statusLabel: "Waiting for Product" });
    expect(byKey["REF-24"]).toMatchObject({ title: 'Pause control "v1"', dueAt: new Date(2026, 10, 20).getTime(), status: "in_progress" });
  });

  it("explains skipped rows and missing columns", () => {
    expect(result.skipped).toEqual([{ row: 6, reason: "No title" }]);
    expect(result.missing).toEqual([]);
    const bare = buildRecords(parseCsv("Key,Title,Status\nA-1,One,Done\nA-1,Again,Done\n,Three,Done"), {
      columns: detectColumns(["Key", "Title", "Status"]), linkPattern: "", now: NOW,
    });
    expect(bare.skipped).toEqual([{ row: 3, reason: "Ticket A-1 appears twice" }, { row: 4, reason: "No ticket key" }]);
    expect(bare.missing).toEqual(["owner", "team", "parent", "sprint", "updated", "resolved"]);
    // Finished without a finish date: counted as finished when it was created, the best date known.
    expect(bare.records[0]).toMatchObject({ status: "done", resolvedAt: NOW, url: "" });
  });

  it("feeds the delivery pages", () => {
    const work = result.records.map((record, id) => ({ ...record, id, source: "c1", sourceName: "Jira export" }));
    expect(deliveryPulse(work, NOW).map((team) => [team.team, team.total, team.done])).toEqual([["Offshore", 3, 1]]);
    expect(blockers(work).map((item) => item.externalId)).toEqual(["REF-22"]);
    expect(epicHealth(work, NOW)[0]).toMatchObject({ total: 3, done: 1, health: "at_risk" });
  });
});

describe("importing replaces a file's tickets", () => {
  it("adds, updates and removes, and the timed sync leaves imports alone", async () => {
    const store = await CaptureStore.open(await openMemoryDb());
    const connection = await store.connections.add("ticket-file", "Jira export");
    const source = `connection-${connection.id}`;
    const rows = parseCsv(JIRA);
    const first = buildRecords(rows, { columns: detectColumns(rows[0]), linkPattern: "", now: NOW });
    await store.work.replaceSource(source, "Jira export", first.records);
    expect(await store.work.list()).toHaveLength(4);

    // A newer export: REF-24 is gone, REF-22 is unblocked.
    const newer = first.records
      .filter((record) => record.externalId !== "REF-24")
      .map((record) => (record.externalId === "REF-22" ? { ...record, status: "in_progress" as const, waitingOnProduct: false } : record));
    await store.work.replaceSource(source, "Jira export", newer);
    const stored = await store.work.list();
    expect(stored.map((item) => item.externalId).sort()).toEqual(["REF-1", "REF-21", "REF-22"]);
    expect(stored.find((item) => item.externalId === "REF-22")).toMatchObject({ status: "in_progress" });

    const reports = await syncAll({
      registry: new ConnectorRegistry().register(ticketFileConnector),
      connections: store.connections, items: store.items, work: store.work, calendar: store.calendar,
      secrets: new MemorySecretStore(), http: async () => ({ status: 500, text: async () => "" }), now: () => NOW,
    });
    expect(reports).toEqual([]);
    expect(await store.work.list()).toHaveLength(3);
  });
});
