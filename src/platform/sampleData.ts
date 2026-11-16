import { dayStart } from "../core/insights";
import type { IncomingItem } from "../core/items";
import type { CaptureKind } from "../core/models";
import type { CaptureStore } from "../core/store";

/**
 * Invented captures for the browser preview only, so the dashboard has something to show.
 * The Mac app never calls this.
 */
export async function seedSampleData(store: CaptureStore): Promise<void> {
  const now = Date.now();
  const at = (daysAgo: number, hour: number) => dayStart(now, daysAgo) + hour * 3_600_000;

  const priya = await store.addPerson("Priya", true);
  const marco = await store.addPerson("Marco", true);
  const lena = await store.addPerson("Lena");
  const portal = await store.addProject("Patient portal");
  const refills = await store.addProject("Refill flow");

  type Sample = [
    body: string,
    kind: CaptureKind,
    daysAgo: number,
    personId: number | null,
    projectId: number | null,
    isWin?: boolean,
    doneDaysAgo?: number,
  ];
  const samples: Sample[] = [
    ["Decide the scope of refill reminders for the pilot", "ask_of_me", 4, priya.id, refills.id],
    ["Send Marco feedback on the portal PRD", "commitment", 2, marco.id, portal.id],
    ["Review the offshore handoff template", "ask_of_me", 1, lena.id, null],
    ["Confirm the Q1 roadmap themes with the CPO", "commitment", 6, null, null],
    ["Estimate for the eligibility check API", "ask_of_them", 3, marco.id, refills.id],
    ["Usability test recruiting plan", "ask_of_them", 5, priya.id, portal.id],
    ["Portal beta cut support tickets by a third", "note", 1, priya.id, portal.id, true],
    ["Refill flow shipped to the first 20 pharmacies", "note", 5, marco.id, refills.id, true],
    ["CPO quoted our onboarding numbers in the board deck", "note", 12, null, null, true],
    ["Priya wants to lead the next discovery cycle", "one_on_one", 2, priya.id, null],
    ["Marco is stretched across two launches", "one_on_one", 3, marco.id, null],
    ["Could the morning brief group items by team?", "thought", 0, null, null],
    ["Pharmacists ask for a way to pause reminders", "thought", 1, null, refills.id],
    ["Approve the copy for the consent screen", "ask_of_me", 5, lena.id, portal.id, false, 3],
    ["Share interview notes with design", "commitment", 6, null, portal.id, false, 4],
    ["Sign off the sprint goal", "ask_of_me", 3, marco.id, null, false, 2],
    ["Reply to the offshore team on the data export", "commitment", 2, lena.id, null, false, 1],
    ["Pricing page experiment readout", "note", 8, null, null],
    ["Offshore stand-up moved an hour earlier", "note", 9, lena.id, null],
    ["Draft the launch checklist", "commitment", 11, null, refills.id, false, 9],
    ["Idea: one view of every open ask per PM", "thought", 13, null, null],
    ["Security review booked for the portal", "note", 15, null, portal.id],
    ["Follow up on the analytics access request", "ask_of_them", 17, lena.id, null, false, 14],
    ["Refill flow research synthesis done", "note", 20, priya.id, refills.id, true],
    ["Kickoff notes for the patient portal", "note", 24, null, portal.id],
    ["Agree the definition of an active pharmacy", "commitment", 27, null, null, false, 22],
    ["Quarterly planning retro notes", "note", 38, null, null],
    ["First draft of the product principles", "note", 52, null, null, true],
    ["Vendor demo follow-up", "ask_of_them", 66, null, null, false, 60],
    ["Notes from the offshore site visit", "note", 80, lena.id, null],
  ];

  let hour = 9;
  for (const [body, kind, daysAgo, personId, projectId, isWin, doneDaysAgo] of samples) {
    hour = hour >= 16 ? 9 : hour + 1;
    // Nothing later than the present moment.
    const created = Math.min(at(daysAgo, hour), now - 60_000);
    const capture = await store.addCapture({ body, kind, personId, projectId, isWin, at: created });
    if (doneDaysAgo !== undefined) {
      await store.setCaptureDone(capture.id, true, Math.min(at(doneDaysAgo, 17), now));
    }
  }

  const hoursAgo = (hours: number) => now - hours * 3_600_000;
  const sampleItems: Omit<IncomingItem, "externalId">[] = [
    {
      source: "gmail", type: "email", author: "Priya", addressedToMe: true, fromMe: false, occurredAt: hoursAgo(9),
      title: "Refill reminders: pilot scope", url: "https://mail.google.com/",
      snippet: "Can you decide whether SMS reminders are in the pilot? Engineering needs your call before sprint planning.",
    },
    {
      source: "confluence", type: "mention", author: "Marco", addressedToMe: true, fromMe: false, occurredAt: hoursAgo(31),
      title: "Patient portal PRD v3", url: "https://www.atlassian.com/software/confluence",
      snippet: "@David please approve the revised success metrics so we can share this with design.",
    },
    {
      source: "gmail", type: "email", author: "Offshore QA lead", addressedToMe: true, fromMe: false, occurredAt: hoursAgo(5),
      title: "Release 4.2 regression results", url: "https://mail.google.com/",
      snippet: "Two medium defects remain. We need your go/no-go for Thursday's release.",
    },
    {
      source: "gmail", type: "email", author: "Lena", addressedToMe: false, fromMe: false, occurredAt: hoursAgo(6),
      title: "Offshore stand-up notes", url: "https://mail.google.com/",
      snippet: "Data export work is on track. Eligibility API integration starts tomorrow.",
    },
    {
      source: "confluence", type: "page_edit", author: "Priya", addressedToMe: false, fromMe: false, occurredAt: hoursAgo(7),
      title: "Refill flow research synthesis", url: "https://www.atlassian.com/software/confluence",
      snippet: "Added findings from the last four pharmacist interviews.",
    },
    {
      source: "confluence", type: "comment", author: "Design lead", addressedToMe: false, fromMe: false, occurredAt: hoursAgo(11),
      title: "Consent screen copy", url: "https://www.atlassian.com/software/confluence",
      snippet: "Updated the mockups to match the approved wording.",
    },
    {
      source: "gmail", type: "email", author: "You", addressedToMe: false, fromMe: true, occurredAt: hoursAgo(100),
      title: "Analytics access for the PM team", url: "https://mail.google.com/",
      snippet: "Could you confirm when the PM team will get dashboard access?",
    },
    {
      source: "gmail", type: "email", author: "You", addressedToMe: false, fromMe: true, occurredAt: hoursAgo(26),
      title: "Eligibility check API estimate", url: "https://mail.google.com/",
      snippet: "Can you send the estimate before Friday's planning?",
    },
    {
      source: "gmail", type: "email", author: "CPO office", addressedToMe: true, fromMe: false, occurredAt: hoursAgo(50),
      title: "Board deck timeline", url: "https://mail.google.com/",
      snippet: "The board deck is due on the 24th. No action needed yet.",
    },
  ];
  for (const [index, item] of sampleItems.entries()) {
    await store.items.upsert({ ...item, externalId: `sample-${index}` });
  }
}
