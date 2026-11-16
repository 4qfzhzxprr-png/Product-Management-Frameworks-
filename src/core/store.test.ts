import { describe, expect, it } from "vitest";
import { openMemoryDb } from "../platform/sqljsDb";
import { CaptureStore } from "./store";

async function makeStore() {
  const db = await openMemoryDb();
  return { db, store: await CaptureStore.open(db) };
}

describe("CaptureStore", () => {
  it("lists captures newest first and trims the text", async () => {
    const { store } = await makeStore();
    await store.addCapture({ body: "first", at: 100 });
    await store.addCapture({ body: "  second  ", at: 200 });

    const captures = await store.captures();
    expect(captures.map((c) => c.body)).toEqual(["second", "first"]);
    expect(captures[0]).toMatchObject({ createdAt: 200, kind: "note", isWin: false, doneAt: null });
  });

  it("rejects an empty capture", async () => {
    const { store } = await makeStore();
    await expect(store.addCapture({ body: "  \n" })).rejects.toThrow();
    expect(await store.captures()).toEqual([]);
  });

  it("keeps people unique ignoring case", async () => {
    const { store } = await makeStore();
    const first = await store.addPerson("Priya", true);
    const again = await store.addPerson(" priya ");
    expect(again).toEqual(first);
    expect(await store.people()).toHaveLength(1);
  });

  it("filters by person and project", async () => {
    const { store } = await makeStore();
    const priya = await store.addPerson("Priya", true);
    const sam = await store.addPerson("Sam");
    const portal = await store.addProject("Portal");
    await store.addCapture({ body: "a", personId: priya.id, projectId: portal.id });
    await store.addCapture({ body: "b", personId: sam.id });
    await store.addCapture({ body: "c", projectId: portal.id });

    expect((await store.captures({ personId: priya.id })).map((c) => c.body)).toEqual(["a"]);
    expect((await store.captures({ projectId: portal.id })).map((c) => c.body).sort()).toEqual(["a", "c"]);
  });

  it("filters and toggles wins", async () => {
    const { store } = await makeStore();
    const win = await store.addCapture({ body: "shipped it", isWin: true });
    const plain = await store.addCapture({ body: "plain" });
    expect((await store.captures({ winsOnly: true })).map((c) => c.id)).toEqual([win.id]);

    await store.setCaptureWin(plain.id, true);
    expect(await store.captures({ winsOnly: true })).toHaveLength(2);
  });

  it("counts open commitments and asks of me as waiting on me", async () => {
    const { store } = await makeStore();
    const commitment = await store.addCapture({ body: "send the deck", kind: "commitment" });
    await store.addCapture({ body: "review my PRD", kind: "ask_of_me" });
    await store.addCapture({ body: "need estimate", kind: "ask_of_them" });
    await store.addCapture({ body: "idea", kind: "thought" });

    expect(await store.waitingOnMeCount()).toBe(2);
    expect(await store.captures({ openOnly: true })).toHaveLength(3);

    await store.setCaptureDone(commitment.id, true, 999);
    expect(await store.waitingOnMeCount()).toBe(1);
    expect((await store.captures()).find((c) => c.id === commitment.id)?.doneAt).toBe(999);

    await store.setCaptureDone(commitment.id, false);
    expect(await store.waitingOnMeCount()).toBe(2);
  });

  it("edits a capture without changing when it was captured or done", async () => {
    const { store } = await makeStore();
    const sam = await store.addPerson("Sam");
    const original = await store.addCapture({ body: "draft", kind: "commitment", at: 100 });
    await store.setCaptureDone(original.id, true, 200);

    await store.updateCapture(original.id, { body: " final ", kind: "ask_of_me", personId: sam.id, isWin: true });
    expect(await store.captures()).toMatchObject([
      { body: "final", kind: "ask_of_me", personId: sam.id, projectId: null, isWin: true, createdAt: 100, doneAt: 200 },
    ]);
    await expect(store.updateCapture(original.id, { body: " " })).rejects.toThrow();
  });

  it("searches case-insensitively and treats wildcards literally", async () => {
    const { store } = await makeStore();
    await store.addCapture({ body: "margin up 5% this quarter" });
    await store.addCapture({ body: "margin up 50 points" });

    expect(await store.captures({ search: "MARGIN" })).toHaveLength(2);
    expect((await store.captures({ search: "5%" })).map((c) => c.body)).toEqual(["margin up 5% this quarter"]);
  });

  it("keeps captures when their person or project is deleted", async () => {
    const { store } = await makeStore();
    const sam = await store.addPerson("Sam");
    const portal = await store.addProject("Portal");
    await store.addCapture({ body: "kept", personId: sam.id, projectId: portal.id });
    await store.deletePerson(sam.id);
    await store.deleteProject(portal.id);

    expect(await store.captures()).toMatchObject([{ body: "kept", personId: null, projectId: null }]);
    expect(await store.people()).toEqual([]);
  });

  it("opens an existing database without losing data", async () => {
    const { db, store } = await makeStore();
    await store.addCapture({ body: "persisted", kind: "commitment" });

    const reopened = await CaptureStore.open(db);
    expect((await reopened.captures()).map((c) => c.body)).toEqual(["persisted"]);
    expect(await reopened.waitingOnMeCount()).toBe(1);
  });
});
