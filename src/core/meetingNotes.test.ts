import { describe, expect, it } from "vitest";
import type { Person } from "./models";
import { dueFromText, meetingPrompt, parseProposals, proposeByRules, toCaptures } from "./meetingNotes";

const people: Person[] = [
  { id: 1, name: "Priya", isPM: true, aliases: ["Priya S."] },
  { id: 2, name: "Morgan", isPM: false, aliases: [] },
];
// Tuesday 17 November 2026, 10:00.
const now = new Date(2026, 10, 17, 10).getTime();

describe("dates in notes", () => {
  it("reads the usual ways of saying when", () => {
    expect(dueFromText("send it by Friday", now)).toBe("2026-11-20");
    expect(dueFromText("by tuesday", now)).toBe("2026-11-24");
    expect(dueFromText("tomorrow please", now)).toBe("2026-11-18");
    expect(dueFromText("before end of week", now)).toBe("2026-11-20");
    expect(dueFromText("next week", now)).toBe("2026-11-27");
    expect(dueFromText("on Dec 3", now)).toBe("2026-12-03");
    expect(dueFromText("2026-12-01", now)).toBe("2026-12-01");
    expect(dueFromText("sometime", now)).toBe("");
  });
});

describe("the simple rules", () => {
  it("finds promises, asks and decisions, with people and dates", () => {
    const notes = `1:1 notes
- I'll send Priya the pilot numbers by Friday.
- Priya will draft the discovery plan by Dec 3
- Can you review the consent copy tomorrow?
- We decided to pilot SMS with 20 pharmacies.
- Talked about hiring for a while.`;
    expect(proposeByRules(notes, people, now, people[0])).toEqual([
      { kind: "commitment", text: "I'll send Priya the pilot numbers by Friday", personId: 1, personName: null, due: "2026-11-20" },
      { kind: "ask_of_them", text: "Priya will draft the discovery plan by Dec 3", personId: 1, personName: null, due: "2026-12-03" },
      { kind: "ask_of_me", text: "Can you review the consent copy tomorrow?", personId: 1, personName: null, due: "2026-11-18" },
      { kind: "decision", text: "We decided to pilot SMS with 20 pharmacies", personId: null, personName: null, due: "" },
    ]);
  });
});

describe("Claude's answer", () => {
  it("keeps well-formed items, matches people by other names and drops the rest", () => {
    const answer = `Here is the list:
\`\`\`json
[
  {"kind": "ask_of_them", "text": "Share the discovery plan", "person": "Priya S.", "due": "2026-12-03"},
  {"kind": "commitment", "text": "Send pilot numbers", "person": "Jordan", "due": null},
  {"kind": "promise", "text": "Not a kind we know"},
  {"kind": "decision", "text": "", "person": null}
]
\`\`\``;
    expect(parseProposals(answer, people)).toEqual([
      { kind: "ask_of_them", text: "Share the discovery plan", personId: 1, personName: null, due: "2026-12-03" },
      { kind: "commitment", text: "Send pilot numbers", personId: null, personName: "Jordan", due: "" },
    ]);
    expect(parseProposals("Sorry, nothing to do.", people)).toEqual([]);
  });

  it("sends today's date and the names David uses, and turns kept items into captures", () => {
    const prompt = meetingPrompt("Notes here", people, now, people[1]);
    expect(prompt).toContain("Tuesday, November 17, 2026 (2026-11-17)");
    expect(prompt).toContain("This was a meeting with Morgan.");
    expect(prompt).toContain("People David works with: Priya, Morgan.");
    expect(prompt.endsWith("Notes:\nNotes here")).toBe(true);
    const [capture] = toCaptures([{ kind: "commitment", text: "Send numbers", personId: 2, personName: null, due: "2026-11-20" }], now);
    expect(capture).toMatchObject({ body: "Send numbers", kind: "commitment", personId: 2, at: now });
    expect(new Date(capture.dueAt!).getDate()).toBe(20);
  });
});

describe("leadership prompts", () => {
  it("keep only the pre-read sections asked for, and describe the audience", async () => {
    const { parsePrereadDraft, prereadPrompt, translatePrompt, GENERIC_AUDIENCES } = await import("./leadershipAI");
    expect(parsePrereadDraft('{"whyNow": "The pilot ends soon.", "options": ["Expand", "Extend"], "ask": "ignored"}', ["whyNow", "options"])).toEqual({
      whyNow: "The pilot ends soon.",
      options: "1. Expand\n2. Extend",
    });
    expect(parsePrereadDraft("no json", ["whyNow"])).toEqual({});
    const prompt = prereadPrompt({ title: "Expand the pilot", ask: "Approve $180k", filled: { whyNow: "Ends in two weeks" }, missing: ["background"], audience: GENERIC_AUDIENCES[1], evidence: ["Pickup up 13 points"] });
    expect(prompt).toContain("Audience: the CFO.");
    expect(prompt).toContain("whyNow: Ends in two weeks");
    expect(prompt).toContain("- Pickup up 13 points");
    expect(prompt.endsWith("Fill these sections: background.")).toBe(true);
    expect(translatePrompt(" Our pilot ", GENERIC_AUDIENCES[0])).toMatch(/^Audience: the CEO\.\nThey are trying to achieve: .+\nThey worry about: .+\n\nRewrite this for them:\n\nOur pilot$/);
  });
});
