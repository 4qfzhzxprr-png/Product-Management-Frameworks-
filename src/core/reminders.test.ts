import { describe, expect, it } from "vitest";
import { defaultHandoffSettings, overlap } from "./handoff";
import type { Capture } from "./models";
import { completeReminderSettings, dueReminders, pruneShown, type ReminderState } from "./reminders";
import { reviewText, weekReview } from "./weekly";

const local = (day: number, hour: number, minute = 0) => new Date(2026, 10, day, hour, minute).getTime();
const capture = (id: number, body: string, kind: Capture["kind"], extra: Partial<Capture> = {}): Capture => ({
  id,
  createdAt: local(10, 9),
  kind,
  body,
  personId: null,
  projectId: null,
  isWin: false,
  doneAt: null,
  dueAt: null,
  ...extra,
});
const settings = completeReminderSettings(null);
const state = (extra: Partial<ReminderState> = {}): ReminderState => ({
  captures: [
    capture(1, "Send the pilot readout", "commitment", { dueAt: local(16, 23, 59) }),
    capture(2, "Draft the Q1 themes", "commitment", { dueAt: local(17, 23, 59) }),
  ],
  decisions: 2,
  handoff: null,
  agentRuns: [],
  ...extra,
});

describe("reminders", () => {
  it("gives a weekday morning summary once, and only until noon", () => {
    // Tuesday 17 November.
    const [morning] = dueReminders(state(), settings, local(17, 8, 45), new Set()).filter((entry) => entry.key.startsWith("morning"));
    expect(morning).toMatchObject({ key: "morning:2026-11-17", title: "Good morning", body: "2 promises and asks open, 1 due today, 1 slipped, 2 decisions waiting." });
    expect(dueReminders(state(), settings, local(17, 8, 0), new Set()).some((entry) => entry.key.startsWith("morning"))).toBe(false);
    expect(dueReminders(state(), settings, local(17, 13), new Set()).some((entry) => entry.key.startsWith("morning"))).toBe(false);
    expect(dueReminders(state(), settings, local(17, 9), new Set(["morning:2026-11-17"])).some((entry) => entry.key.startsWith("morning"))).toBe(false);
    // Saturday: no summary.
    expect(dueReminders(state(), settings, local(21, 9), new Set()).some((entry) => entry.key.startsWith("morning"))).toBe(false);
  });

  it("nudges once per slipped promise and per finished agent run", () => {
    const due = dueReminders(state({ agentRuns: [{ id: 7, agentName: "spec-writer", title: "Refill PRD" }] }), settings, local(17, 14), new Set());
    expect(due.map((entry) => entry.key)).toEqual(["slipped:1", "run:7"]);
    expect(due[0].body).toBe("Send the pilot readout was due 1 day ago.");
    expect(due[1]).toMatchObject({ title: "spec-writer finished", body: "Refill PRD is waiting for your review.", view: "agents" });
  });

  it("warns before the shared hours with the offshore team end", () => {
    const handoff = { ...defaultHandoffSettings("America/Chicago"), offshoreZone: "Europe/London", offshoreStart: "09:00", offshoreEnd: "17:30" };
    const tuesday = Date.UTC(2026, 10, 17, 15);
    const window = overlap(handoff, tuesday).window!;
    const at = (time: number) => dueReminders(state({ handoff }), { ...settings, morning: "" }, time, new Set()).filter((entry) => entry.key.startsWith("handoff"));
    expect(at(window[1] - 20 * 60_000)).toHaveLength(1);
    expect(at(window[1] - 20 * 60_000)[0].body).toBe("The offshore team's shared hours end in 20 minutes. Send the handoff note.");
    expect(at(window[1] - 60 * 60_000)).toHaveLength(0);
    expect(at(window[1] + 60_000)).toHaveLength(0);
  });

  it("prompts the weekly review on Friday afternoons, and can be switched off", () => {
    expect(dueReminders(state(), settings, local(20, 16, 5), new Set()).map((entry) => entry.key)).toContain("weekly:2026-11-20");
    expect(dueReminders(state(), { ...settings, enabled: false }, local(20, 16, 5), new Set())).toEqual([]);
    expect(pruneShown({ old: local(1, 9), fresh: local(17, 9) }, local(17, 10))).toEqual({ fresh: local(17, 9) });
  });
});

describe("the weekly review", () => {
  it("gathers this week, or last week early in the week", () => {
    const captures = [
      capture(1, "Pilot readout sent", "commitment", { doneAt: local(19, 10) }),
      capture(2, "Portal beta cut tickets by a third", "note", { isWin: true, createdAt: local(18, 9) }),
      capture(3, "Pilot SMS with 20 pharmacies", "decision", { createdAt: local(18, 11) }),
      capture(4, "Q1 themes", "commitment", { dueAt: local(18, 23, 59) }),
    ];
    const friday = weekReview({ captures, work: [], roadmap: [], now: local(20, 16) });
    expect(friday.label).toBe("This week");
    expect(friday.done.map((entry) => entry.body)).toEqual(["Pilot readout sent"]);
    expect(friday.wins.map((entry) => entry.body)).toEqual(["Portal beta cut tickets by a third"]);
    expect(friday.decisions.map((entry) => entry.body)).toEqual(["Pilot SMS with 20 pharmacies"]);
    expect(friday.slipped).toEqual([{ capture: captures[3], days: 2 }]);
    expect(weekReview({ captures, work: [], roadmap: [], now: local(23, 9) }).label).toBe("Last week");

    const text = reviewText(friday, { priorities: ["Ship the pilot", "", "Hire the offshore lead"], note: "Good week." }, []);
    expect(text).toContain("Weekly review, Nov 16 to Nov 20");
    expect(text).toContain("Next week's priorities\n1. Ship the pilot\n2. Hire the offshore lead");
    expect(text).toContain("Slipped\n- Q1 themes: 2 days late");
    expect(text.endsWith("Notes\nGood week.")).toBe(true);
  });
});
