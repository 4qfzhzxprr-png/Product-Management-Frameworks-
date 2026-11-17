import { describe, expect, it } from "vitest";
import { openMemoryDb } from "../platform/sqljsDb";
import {
  ConnectorRegistry,
  MemorySecretStore,
  sourceOf,
  syncAll,
  type Connector,
  type HttpClient,
  type SyncContext,
} from "./connectors";
import type { Activity } from "./items";
import { CaptureStore } from "./store";

const activity = (externalId: string, extra: Partial<Activity> = {}): Activity => ({
  externalId,
  kind: "Message",
  title: `Thing ${externalId}`,
  snippet: "Can you approve this?",
  author: "Priya",
  url: "https://example.test/x",
  occurredAt: 1000,
  addressedToMe: true,
  fromMe: false,
  ...extra,
});

const noHttp: HttpClient = async () => {
  throw new Error("no network in tests");
};

async function setup(...connectors: Connector[]) {
  const store = await CaptureStore.open(await openMemoryDb());
  const registry = new ConnectorRegistry();
  connectors.forEach((connector) => registry.register(connector));
  const secrets = new MemorySecretStore();
  const sync = (now = 5000) =>
    syncAll({
      registry,
      connections: store.connections,
      items: store.items,
      work: store.work,
      calendar: store.calendar,
      secrets,
      http: noHttp,
      now: () => now,
    });
  return { store, registry, secrets, sync };
}

/** A connector for a system the app has never heard of. */
function fakeConnector(id: string, run: (context: SyncContext) => Activity[], fields: Connector["fields"] = []): Connector {
  return {
    id,
    name: id,
    description: "",
    fields,
    sync: async (context) => ({ activities: run(context), cursor: String(context.now) }),
  };
}

describe("syncAll", () => {
  it("brings activity in from any registered connector, labelled with its connection", async () => {
    const { store, sync } = await setup(fakeConnector("made-up-system", () => [activity("a"), activity("b")]));
    const connection = await store.connections.add("made-up-system", "Vendor portal");

    const [report] = await sync();
    expect(report).toMatchObject({ received: 2, error: null });

    const items = await store.items.list();
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      source: sourceOf(connection.id),
      sourceName: "Vendor portal",
      kind: "Message",
      bucket: "decision",
    });
  });

  it("keeps one failing connection from blocking the others, and records the error", async () => {
    const { store, sync } = await setup(
      fakeConnector("works", () => [activity("a")]),
      fakeConnector("broken", () => {
        throw new Error("401 Unauthorized");
      }),
    );
    await store.connections.add("works", "Good");
    await store.connections.add("broken", "Bad");
    await store.connections.add("not-installed", "Gone");

    const reports = await sync(7000);
    expect(reports.map((report) => [report.connection.name, report.error])).toEqual([
      ["Bad", "401 Unauthorized"],
      ["Gone", 'No connector called "not-installed" is installed.'],
      ["Good", null],
    ]);
    expect(await store.items.list()).toHaveLength(1);

    const stored = await store.connections.list();
    expect(stored.find((connection) => connection.name === "Bad")).toMatchObject({
      lastSyncAt: 7000,
      lastError: "401 Unauthorized",
      cursor: null,
    });
    expect(stored.find((connection) => connection.name === "Good")).toMatchObject({ lastError: null, cursor: "7000" });
  });

  it("hands each sync its config, secrets and the cursor from last time", async () => {
    const seen: SyncContext[] = [];
    const { store, secrets, sync } = await setup(
      fakeConnector(
        "tracker",
        (context) => {
          seen.push(context);
          return [];
        },
        [
          { key: "site", label: "Site address", required: true },
          { key: "token", label: "API token", required: true, secret: true },
        ],
      ),
    );
    const connection = await store.connections.add("tracker", "Tracker", { site: "https://tracker.test" });

    expect((await sync(100))[0].error).toBe("Missing: API token.");
    expect(seen).toHaveLength(0);

    await secrets.set(connection.id, { token: "s3cret" });
    await sync(200);
    await sync(300);
    expect(seen.map((context) => [context.config.site, context.secrets.token, context.cursor])).toEqual([
      ["https://tracker.test", "s3cret", null],
      ["https://tracker.test", "s3cret", "200"],
    ]);
    // The secret is not in the database.
    expect(JSON.stringify(await store.connections.list())).not.toContain("s3cret");
  });

  it("skips disabled connections and removes a connection's items with it", async () => {
    const { store, sync } = await setup(fakeConnector("mail", () => [activity("a")]));
    const first = await store.connections.add("mail", "Work email");
    const second = await store.connections.add("mail", "Shared inbox");
    await store.connections.setEnabled(second.id, false);

    expect(await sync()).toHaveLength(1);
    await store.connections.setEnabled(second.id, true);
    await sync();
    // Two connections of the same kind keep their items apart, even with equal external ids.
    expect((await store.items.list()).map((item) => item.sourceName).sort()).toEqual(["Shared inbox", "Work email"]);

    await store.connections.remove(first.id);
    expect((await store.items.list()).map((item) => item.sourceName)).toEqual(["Shared inbox"]);
    expect(await store.connections.list()).toHaveLength(1);
  });

  it("stores tickets a connector reports, and removes them with the connection", async () => {
    const tracker: Connector = {
      id: "any-tracker",
      name: "Any tracker",
      description: "",
      fields: [],
      sync: async () => ({
        activities: [],
        work: [
          {
            externalId: "T-1", kind: "Story", level: "item", title: "Build it", url: "https://t.test/T-1",
            status: "blocked", statusLabel: "On hold", ownerName: "Sam", team: "Offshore", parentExternalId: null,
            sprint: "Sprint 9", sprintEndsAt: 9000, dueAt: null, createdAt: 1, updatedAt: 2, waitingOnProduct: true,
            resolvedAt: null,
          },
        ],
      }),
    };
    const { store, sync } = await setup(tracker);
    const connection = await store.connections.add("any-tracker", "Delivery board");
    await sync();
    await sync();

    expect(await store.work.list()).toMatchObject([
      { externalId: "T-1", sourceName: "Delivery board", status: "blocked", statusLabel: "On hold", waitingOnProduct: true },
    ]);
    await store.connections.remove(connection.id);
    expect(await store.work.list()).toEqual([]);
  });

  it("refuses two connectors with the same id", () => {
    const registry = new ConnectorRegistry().register(fakeConnector("x", () => []));
    expect(() => registry.register(fakeConnector("x", () => []))).toThrow();
  });
});
