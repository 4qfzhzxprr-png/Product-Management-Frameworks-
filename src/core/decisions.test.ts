import { describe, expect, it } from "vitest";
import { openMemoryDb } from "../platform/sqljsDb";
import { decisionRegister, registerText } from "./decisions";
import { quoteMetric, summarize } from "./metrics";
import { CaptureStore } from "./store";

const local = (month: number, day: number) => new Date(2026, month, day, 9).getTime();

describe("the decision register", () => {
  it("adds why, who and status to decisions, puts ones due for review first, and filters", async () => {
    const store = await CaptureStore.open(await openMemoryDb());
    const sms = await store.addCapture({ body: "Pilot SMS with 20 pharmacies", kind: "decision", at: local(9, 1) });
    const owner = await store.addCapture({ body: "Offshore team owns eligibility", kind: "decision", at: local(10, 1) });
    await store.addCapture({ body: "Not a decision", kind: "note" });
    await store.decisions.save(sms.id, { why: " Cheapest way to learn ", agreed: "Jordan, Morgan", status: "standing", revisitAt: local(10, 10) });
    const register = decisionRegister(await store.captures(), await store.decisions.all(), local(10, 17));
    expect(register.map((entry) => [entry.capture.body, entry.due])).toEqual([
      ["Pilot SMS with 20 pharmacies", true],
      ["Offshore team owns eligibility", false],
    ]);
    expect(register[0].details.why).toBe("Cheapest way to learn");
    expect(register[1].details.status).toBe("standing");
    expect(decisionRegister(await store.captures(), await store.decisions.all(), local(10, 17), "morgan").map((entry) => entry.capture.id)).toEqual([sms.id]);
    expect(registerText(register)).toContain("Why: Cheapest way to learn\n  Agreed by: Jordan, Morgan");

    await store.deleteCapture(owner.id);
    await store.decisions.save(sms.id, { why: "x", agreed: "", status: "reversed", revisitAt: local(10, 10) });
    expect(decisionRegister(await store.captures(), await store.decisions.all(), local(10, 17))[0]).toMatchObject({ due: false, details: { status: "reversed" } });
  });
});

describe("metric targets", () => {
  it("summarizes the trend against the target and quotes it in one line", async () => {
    const store = await CaptureStore.open(await openMemoryDb());
    const id = await store.metrics.add({ name: "Refill pickup rate", unit: "%", target: 85, higherIsBetter: true });
    await store.metrics.record(id, 71, local(7, 1));
    await store.metrics.record(id, 84, local(10, 1));
    const [metric] = await store.metrics.metrics();
    const summary = summarize(metric, await store.metrics.points());
    expect(summary).toMatchObject({ change: 13, onTarget: false, improving: true });
    expect(summary.progress).toBeCloseTo(13 / 14);
    expect(quoteMetric(summary)).toMatch(/^Refill pickup rate: 84%, up from 71% in Aug 2026 \(target 85%\)$/);

    const tickets = await store.metrics.add({ name: "Support tickets per week", unit: "", target: 40, higherIsBetter: false });
    await store.metrics.record(tickets, 60, local(7, 1));
    await store.metrics.record(tickets, 38, local(10, 1));
    const ticketSummary = summarize((await store.metrics.metrics()).find((entry) => entry.id === tickets)!, await store.metrics.points());
    expect(ticketSummary).toMatchObject({ onTarget: true, improving: true, progress: 1 });
    expect(quoteMetric(ticketSummary)).toMatch(/down from 60 in Aug 2026 \(target 40, met\)$/);
    await expect(store.metrics.record(id, Number.NaN)).rejects.toThrow();
    await store.metrics.remove(id);
    expect((await store.metrics.points()).every((point) => point.metricId !== id)).toBe(true);
  });
});
