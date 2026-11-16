import { describe, expect, it } from "vitest";
import { openMemoryDb } from "../platform/sqljsDb";
import { buildBrief, classify, overnightStart, type IncomingItem, type SourceItem } from "./items";
import { CaptureStore } from "./store";

const base: IncomingItem = {
  source: "gmail",
  externalId: "t1",
  type: "email",
  title: "Refill reminders",
  snippet: "Sharing the latest numbers.",
  author: "Priya",
  url: "https://mail.example/t1",
  occurredAt: 1000,
  addressedToMe: true,
  fromMe: false,
};

describe("classify", () => {
  it("puts questions and approval requests addressed to me under decisions", () => {
    expect(classify({ ...base, snippet: "Can you approve the scope by Friday?" })).toBe("decision");
    expect(classify({ ...base, snippet: "We need your sign-off before the release." })).toBe("decision");
    expect(classify({ ...base, title: "Go/no-go for the pilot", snippet: "Details inside." })).toBe("decision");
  });

  it("treats things not addressed to me, or with nothing asked, as FYI", () => {
    expect(classify(base)).toBe("fyi");
    expect(classify({ ...base, addressedToMe: false, snippet: "Can someone approve this?" })).toBe("fyi");
  });

  it("marks my own unanswered questions as waiting on someone else", () => {
    expect(classify({ ...base, fromMe: true, snippet: "Could you send the estimate?" })).toBe("waiting");
    expect(classify({ ...base, fromMe: true, snippet: "Thanks, noted." })).toBe("fyi");
  });
});

describe("overnightStart", () => {
  it("is 6pm the previous working day", () => {
    const wednesday = new Date(2026, 10, 18, 8).getTime();
    expect(overnightStart(wednesday)).toBe(new Date(2026, 10, 17, 18).getTime());
  });

  it("covers the weekend on Monday and on Sunday", () => {
    const friday6pm = new Date(2026, 10, 13, 18).getTime();
    expect(overnightStart(new Date(2026, 10, 16, 8).getTime())).toBe(friday6pm);
    expect(overnightStart(new Date(2026, 10, 15, 8).getTime())).toBe(friday6pm);
  });
});

describe("buildBrief", () => {
  const now = new Date(2026, 10, 18, 8).getTime();
  const hoursAgo = (hours: number) => now - hours * 3_600_000;
  let id = 1;
  const item = (extra: Partial<SourceItem>): SourceItem => ({
    ...base,
    id: id++,
    externalId: `t${id}`,
    bucket: "fyi",
    moved: false,
    dismissedAt: null,
    ...extra,
  });

  const brief = buildBrief(
    [
      item({ title: "new decision", bucket: "decision", occurredAt: hoursAgo(3) }),
      item({ title: "old decision", bucket: "decision", occurredAt: hoursAgo(80) }),
      item({ title: "overnight fyi", occurredAt: hoursAgo(5) }),
      item({ title: "yesterday afternoon", occurredAt: hoursAgo(20) }),
      item({ title: "my own reply", fromMe: true, occurredAt: hoursAgo(4) }),
      item({ title: "dismissed", occurredAt: hoursAgo(2), dismissedAt: now }),
      item({ title: "stale ask", bucket: "waiting", fromMe: true, occurredAt: hoursAgo(100) }),
      item({ title: "fresh ask", bucket: "waiting", fromMe: true, occurredAt: hoursAgo(30) }),
    ],
    now,
  );

  it("lists every open decision, longest wait first", () => {
    expect(brief.decisions.map((entry) => entry.title)).toEqual(["old decision", "new decision"]);
  });

  it("lists other people's activity since last evening, newest first", () => {
    expect(brief.overnight.map((entry) => entry.title)).toEqual(["overnight fyi"]);
  });

  it("flags asks that have waited three days", () => {
    expect(brief.stale.map((entry) => entry.title)).toEqual(["stale ask"]);
  });
});

describe("ItemStore", () => {
  async function makeStore() {
    return (await CaptureStore.open(await openMemoryDb())).items;
  }

  it("classifies on the way in and keeps one row per external id", async () => {
    const items = await makeStore();
    await items.upsert({ ...base, snippet: "Can you approve this?" });
    await items.upsert({ ...base, snippet: "Can you approve this? Bumping.", occurredAt: 2000 });

    const stored = await items.list();
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ bucket: "decision", moved: false, occurredAt: 2000, addressedToMe: true });
    expect(await items.decisionCount()).toBe(1);
  });

  it("keeps a bucket I chose through later syncs", async () => {
    const items = await makeStore();
    await items.upsert({ ...base, snippet: "Can you approve this?" });
    const [stored] = await items.list();
    await items.move(stored.id, "fyi");
    await items.upsert({ ...base, snippet: "Can you approve this? Again.", occurredAt: 3000 });

    expect((await items.list())[0]).toMatchObject({ bucket: "fyi", moved: true });
    expect(await items.decisionCount()).toBe(0);
  });

  it("hides dismissed items until something new happens on them", async () => {
    const items = await makeStore();
    await items.upsert(base);
    const [stored] = await items.list();
    await items.dismiss(stored.id);
    expect(await items.list()).toEqual([]);
    expect(await items.list({ includeDismissed: true })).toHaveLength(1);

    await items.upsert(base);
    expect(await items.list()).toEqual([]);

    await items.upsert({ ...base, occurredAt: 5000 });
    expect(await items.list()).toHaveLength(1);
  });

  it("keeps sources apart and lists newest first", async () => {
    const items = await makeStore();
    await items.upsert({ ...base, occurredAt: 10 });
    await items.upsert({ ...base, source: "confluence", type: "comment", occurredAt: 20 });
    expect((await items.list()).map((entry) => entry.source)).toEqual(["confluence", "gmail"]);
  });
});
