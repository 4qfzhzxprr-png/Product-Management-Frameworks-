import { describe, expect, it } from "vitest";
import type { Connection } from "./connectors";
import { setupSteps, waitingTotal } from "./setup";

const connection = (id: number, connectorId: string): Connection => ({
  id,
  connectorId,
  name: connectorId,
  config: {},
  enabled: true,
  cursor: null,
  lastSyncAt: null,
  lastError: null,
});
const manual = (entry: Connection) => entry.connectorId === "ticket-file";

describe("setupSteps", () => {
  it("has every step open on a fresh install", () => {
    const steps = setupSteps({ connections: [], manual, hasPMs: false, managerChosen: false, hasCaptures: false });
    expect(steps.map((step) => step.id)).toEqual(["calendar", "tickets", "team", "manager", "capture"]);
    expect(steps.every((step) => !step.done)).toBe(true);
  });

  it("tells a calendar feed from a ticket import", () => {
    const onlyImport = setupSteps({ connections: [connection(1, "ticket-file")], manual, hasPMs: true, managerChosen: false, hasCaptures: true });
    expect(onlyImport.filter((step) => step.done).map((step) => step.id)).toEqual(["tickets", "team", "capture"]);
    const both = setupSteps({
      connections: [connection(1, "ticket-file"), connection(2, "ical")],
      manual,
      hasPMs: true,
      managerChosen: true,
      hasCaptures: true,
    });
    expect(both.every((step) => step.done)).toBe(true);
  });
});

describe("waitingTotal", () => {
  it("adds decisions to open captures, as the menu bar does", () => {
    expect(waitingTotal(7, 3)).toBe(10);
  });
});
