import { dayStart } from "../core/insights";
import type { IncomingItem } from "../core/items";
import type { CaptureKind } from "../core/models";
import type { CaptureStore } from "../core/store";
import type { WorkRecord } from "../core/work";

/**
 * Invented captures for the browser preview only, so the dashboard has something to show.
 * The Mac app never calls this.
 */
export async function seedSampleData(store: CaptureStore): Promise<void> {
  const now = Date.now();
  const at = (daysAgo: number, hour: number) => dayStart(now, daysAgo) + hour * 3_600_000;

  const priya = await store.addPerson("Priya", true);
  await store.setAliases(priya.id, ["Priya S."]);
  const marco = await store.addPerson("Marco", true);
  const lena = await store.addPerson("Lena");
  // The person David reports to, in the sample.
  const jordan = await store.addPerson("Jordan");
  // Executives on the stakeholder map, in the sample.
  const morgan = await store.addPerson("Morgan");
  const taylor = await store.addPerson("Taylor");
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
    dueInDays?: number,
  ];
  const samples: Sample[] = [
    ["Q1 headcount approval for the offshore team", "ask_of_them", 4, jordan.id, null],
    ["Cost to onboard each new pharmacy", "ask_of_me", 12, morgan.id, refills.id],
    ["Margin impact of the refill pilot", "ask_of_me", 40, morgan.id, refills.id, false, 33],
    ["Pharmacist at a pilot store: reminders save her an hour a day", "evidence", 6, null, refills.id],
    ["A clinic group asked to join the portal beta early", "evidence", 15, null, portal.id],
    ["Support tickets down 33% since the portal beta", "metric", 3, null, portal.id],
    ["Refill pickup rate up from 71% to 84% at pilot pharmacies", "metric", 7, null, refills.id],
    ["Send the refill pilot readout", "commitment", 3, jordan.id, refills.id, false, undefined, 2],
    ["Share the pricing experiment results", "ask_of_me", 2, jordan.id, null],
    ["How we report pilot results to the board", "agenda", 3, jordan.id, null],
    ["Agreed the portal beta stays invite-only until January", "one_on_one", 8, jordan.id, portal.id],
    ["Pilot SMS reminders with 20 pharmacies before a wider launch", "decision", 2, null, refills.id],
    ["Offshore team owns the eligibility work end to end", "decision", 4, null, refills.id],
    ["Decide the scope of refill reminders for the pilot", "ask_of_me", 4, priya.id, refills.id],
    ["Send Marco feedback on the portal PRD", "commitment", 2, marco.id, portal.id, false, undefined, 1],
    ["Review the offshore handoff template", "ask_of_me", 1, lena.id, null],
    ["Confirm the Q1 roadmap themes with the CPO", "commitment", 6, null, null, false, undefined, -2],
    ["Estimate for the eligibility check API", "ask_of_them", 3, marco.id, refills.id, false, undefined, -1],
    ["Usability test recruiting plan", "ask_of_them", 5, priya.id, portal.id, false, undefined, 4],
    ["Portal beta cut support tickets by a third", "note", 1, priya.id, portal.id, true],
    ["Refill flow shipped to the first 20 pharmacies", "note", 5, marco.id, refills.id, true],
    ["CPO quoted our onboarding numbers in the board deck", "note", 12, null, null, true],
    ["Priya wants to lead the next discovery cycle", "one_on_one", 2, priya.id, null],
    ["Scope for the next discovery cycle", "agenda", 4, priya.id, null],
    ["Feedback on the pilot readout", "agenda", 0, priya.id, null],
    ["Onboarding pairing with the offshore team", "one_on_one", 9, priya.id, null],
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
  for (const [body, kind, daysAgo, personId, projectId, isWin, doneDaysAgo, dueInDays] of samples) {
    hour = hour >= 16 ? 9 : hour + 1;
    // Nothing later than the present moment.
    const created = Math.min(at(daysAgo, hour), now - 60_000);
    const dueAt = dueInDays === undefined ? null : dayStart(now, -dueInDays) + 86_399_000;
    const capture = await store.addCapture({ body, kind, personId, projectId, isWin, dueAt, at: created });
    if (doneDaysAgo !== undefined) {
      await store.setCaptureDone(capture.id, true, Math.min(at(doneDaysAgo, 17), now));
    }
  }

  const hoursAgo = (hours: number) => now - hours * 3_600_000;
  const sampleItems: Omit<IncomingItem, "externalId" | "source">[] = [
    {
      sourceName: "Email", kind: "", author: "Priya", addressedToMe: true, fromMe: false, occurredAt: hoursAgo(9),
      title: "Refill reminders: pilot scope", url: "https://mail.google.com/",
      snippet: "Can you decide whether SMS reminders are in the pilot? Engineering needs your call before sprint planning.",
    },
    {
      sourceName: "Wiki", kind: "Mention", author: "Marco", addressedToMe: true, fromMe: false, occurredAt: hoursAgo(31),
      title: "Patient portal PRD v3", url: "https://www.atlassian.com/software/confluence",
      snippet: "@David please approve the revised success metrics so we can share this with design.",
    },
    {
      sourceName: "Email", kind: "", author: "Offshore QA lead", addressedToMe: true, fromMe: false, occurredAt: hoursAgo(5),
      title: "Release 4.2 regression results", url: "https://mail.google.com/",
      snippet: "Two medium defects remain. We need your go/no-go for Thursday's release.",
    },
    {
      sourceName: "Wiki", kind: "Review requested", author: "Priya", addressedToMe: true, fromMe: false, occurredAt: hoursAgo(74),
      title: "Refill flow PRD", url: "https://www.atlassian.com/software/confluence",
      snippet: "Ready for your review. Could you read through the open questions section first?",
    },
    {
      sourceName: "Email", kind: "", author: "Lena", addressedToMe: false, fromMe: false, occurredAt: hoursAgo(6),
      title: "Offshore stand-up notes", url: "https://mail.google.com/",
      snippet: "Data export work is on track. Eligibility API integration starts tomorrow.",
    },
    {
      sourceName: "Wiki", kind: "Page edited", author: "Priya", addressedToMe: false, fromMe: false, occurredAt: hoursAgo(7),
      title: "Refill flow research synthesis", url: "https://www.atlassian.com/software/confluence",
      snippet: "Added findings from the last four pharmacist interviews.",
    },
    {
      sourceName: "Wiki", kind: "Comment", author: "Design lead", addressedToMe: false, fromMe: false, occurredAt: hoursAgo(11),
      title: "Consent screen copy", url: "https://www.atlassian.com/software/confluence",
      snippet: "Updated the mockups to match the approved wording.",
    },
    {
      sourceName: "Email", kind: "", author: "You", addressedToMe: false, fromMe: true, occurredAt: hoursAgo(100),
      title: "Analytics access for the PM team", url: "https://mail.google.com/",
      snippet: "Could you confirm when the PM team will get dashboard access?",
    },
    {
      sourceName: "Email", kind: "", author: "You", addressedToMe: false, fromMe: true, occurredAt: hoursAgo(26),
      title: "Eligibility check API estimate", url: "https://mail.google.com/",
      snippet: "Can you send the estimate before Friday's planning?",
    },
    {
      sourceName: "Email", kind: "", author: "CPO office", addressedToMe: true, fromMe: false, occurredAt: hoursAgo(50),
      title: "Board deck timeline", url: "https://mail.google.com/",
      snippet: "The board deck is due on the 24th. No action needed yet.",
    },
  ];
  for (const [index, item] of sampleItems.entries()) {
    await store.items.upsert({ ...item, source: `sample-${item.sourceName}`, externalId: `sample-${index}` });
  }

  const DAY = 86_400_000;
  const work = (
    externalId: string,
    title: string,
    status: WorkRecord["status"],
    statusLabel: string,
    team: string,
    extra: Partial<WorkRecord> = {},
  ): WorkRecord => ({
    externalId, title, status, statusLabel, team,
    kind: "Story", level: "item", url: "https://www.atlassian.com/software/jira", ownerName: "",
    parentExternalId: null, sprint: "Sprint 24", sprintEndsAt: now + 4 * DAY, dueAt: null,
    createdAt: now - 20 * DAY, updatedAt: now - DAY, waitingOnProduct: false, resolvedAt: null,
    ...extra,
  });
  const epic = (externalId: string, title: string, ownerName: string, extra: Partial<WorkRecord> = {}) =>
    work(externalId, title, "in_progress", "In progress", "", { kind: "Epic", level: "epic", sprint: null, sprintEndsAt: null, ownerName, ...extra });
  const sampleWork: WorkRecord[] = [
    // The tracker spells Priya's name differently; her other names in the app cover it.
    epic("PORT-1", "Patient portal beta", "Priya S.", { dueAt: now + 20 * DAY }),
    epic("REF-1", "Refill flow pilot", "Marco", { dueAt: now + 9 * DAY }),
    epic("REF-2", "Eligibility check", "Marco", { dueAt: now - 2 * DAY }),
    work("PORT-12", "Consent screen", "done", "Done", "Onshore", { resolvedAt: now - 2 * DAY, parentExternalId: "PORT-1" }),
    work("PORT-14", "Appointment list", "done", "Done", "Onshore", { resolvedAt: now - 9 * DAY, parentExternalId: "PORT-1" }),
    work("PORT-15", "Secure messaging inbox", "in_progress", "In review", "Onshore", { parentExternalId: "PORT-1" }),
    work("PORT-18", "Accessibility pass", "todo", "Ready for dev", "Onshore", { parentExternalId: "PORT-1" }),
    work("REF-21", "Reminder scheduling service", "done", "Done", "Offshore", { resolvedAt: now - 1 * DAY, parentExternalId: "REF-1" }),
    work("REF-22", "SMS reminder template", "blocked", "Blocked", "Offshore", {
      parentExternalId: "REF-1", waitingOnProduct: true, updatedAt: now - 4 * DAY,
    }),
    work("REF-24", "Pharmacist pause control", "in_progress", "In progress", "Offshore", {
      parentExternalId: "REF-1", updatedAt: now - 9 * DAY,
    }),
    work("REF-25", "Reminder audit log", "todo", "To do", "Offshore", { parentExternalId: "REF-1" }),
    work("REF-31", "Eligibility API client", "in_progress", "In progress", "Offshore", { parentExternalId: "REF-2" }),
    work("REF-33", "Payer response mapping", "blocked", "Blocked", "Offshore", {
      parentExternalId: "REF-2", updatedAt: now - 6 * DAY,
    }),
    work("OPS-7", "Data export for analytics", "done", "Done", "Offshore", { resolvedAt: now - 4 * DAY }),
  ];
  for (const record of sampleWork) {
    await store.work.upsert({ ...record, source: "sample-tracker", sourceName: "Tracker" });
  }

  // The CPO's priorities and the roadmap given to leadership, linked to the sample epics.
  const epicRef = (externalId: string) => ({ source: "sample-tracker", externalId });
  const { leadership } = store;
  const growth = await leadership.addPriority("Grow pharmacy adoption");
  await leadership.updatePriority(growth.id, { title: growth.title, notes: "Twice as many active pharmacies by June." });
  const selfService = await leadership.addPriority("Patient self-service");
  await leadership.addPriority("Platform reliability");
  await leadership.linkEpic("priority", growth.id, epicRef("REF-1"), 4, now - 30 * DAY);
  await leadership.linkEpic("priority", selfService.id, epicRef("PORT-1"), 4, now - 30 * DAY);

  const pilot = await leadership.addRoadmapItem({
    title: "Refill reminders pilot live", committedAt: dayStart(now, -9) + 86_399_000, toLeadership: true, at: now - 25 * DAY,
  });
  const eligibility = await leadership.addRoadmapItem({
    title: "Eligibility checks for the top payers", committedAt: dayStart(now, 2) + 86_399_000, toLeadership: true, at: now - 30 * DAY,
  });
  const beta = await leadership.addRoadmapItem({
    title: "Patient portal beta", committedAt: dayStart(now, -20) + 86_399_000, toLeadership: true, at: now - 20 * DAY,
  });
  // Linked when the pilot had two tickets; it has four now.
  await leadership.linkEpic("roadmap", pilot, epicRef("REF-1"), 2, now - 25 * DAY);
  await leadership.linkEpic("roadmap", eligibility, epicRef("REF-2"), 2, now - 30 * DAY);
  await leadership.linkEpic("roadmap", beta, epicRef("PORT-1"), 4, now - 10 * DAY);

  await store.settings.set("leadership", { managerId: jordan.id });

  await store.influence.saveStakeholder(jordan.id, {
    title: "CPO",
    goals: "A product org the CEO trusts to hit dates.",
    concerns: "Surprises in front of the board.",
  });
  await store.influence.saveStakeholder(morgan.id, {
    title: "CFO",
    goals: "Lower cost to serve each pharmacy; margin above 30% by year end.",
    concerns: "Pilots that never turn into revenue.",
  });
  await store.influence.saveStakeholder(taylor.id, { title: "CEO", goals: "", concerns: "" });
  const preread = await store.influence.createPreread("Expand the refill pilot to 100 pharmacies", morgan.id, now - 2 * DAY);
  await store.influence.savePreread(
    preread,
    {
      title: "Expand the refill pilot to 100 pharmacies",
      personId: morgan.id,
      ask: "Approve $180k to take refill reminders from 20 to 100 pharmacies next quarter.",
      whyNow: "The pilot ends in two weeks; pausing means rebuilding pharmacy relationships later.",
      background: "",
      options: "1. Expand to 100 now.\n2. Extend the pilot at 20 for another quarter.\n3. Stop and fold learnings into the portal.",
      recommendation: "Expand now. Pickup rates rose 13 points and onboarding cost is falling.",
      evidenceIds: [],
    },
    now - DAY,
  );

  // A calendar: stand-up and a review today, and 1:1s in the coming days.
  const ahead = (days: number, hour: number, minute = 0) => dayStart(now, -days) + (hour * 60 + minute) * 60_000;
  const meeting = (title: string, startsAt: number, minutes: number, location = "") => ({
    externalId: `${title}-${startsAt}`, title, startsAt, endsAt: startsAt + minutes * 60_000, allDay: false, location, url: "",
  });
  await store.calendar.replaceSource("sample-calendar", "Work calendar", [
    meeting("Offshore stand-up", ahead(0, 8, 30), 30),
    meeting("Roadmap review", ahead(0, 11), 60, "Room 4"),
    meeting("Pricing experiment readout", ahead(0, 15), 45),
    meeting("Priya / David 1:1", ahead(1, 10), 30),
    meeting("Marco 1:1", ahead(2, 14), 30),
    meeting("Jordan / David weekly 1:1", ahead(3, 9), 45),
  ]);

  // Why the sample decisions were made.
  const decisions = (await store.captures()).filter((capture) => capture.kind === "decision");
  const smsDecision = decisions.find((capture) => capture.body.startsWith("Pilot SMS"));
  if (smsDecision) {
    await store.decisions.save(smsDecision.id, {
      why: "Cheapest way to learn whether reminders lift pickup before paying for a wider rollout.",
      agreed: "Jordan, Morgan",
      status: "standing",
      revisitAt: now + 21 * DAY,
    });
  }

  // Two metrics with a few months of history.
  const pickup = await store.metrics.add({ name: "Refill pickup rate", unit: "%", target: 85, higherIsBetter: true, at: now - 120 * DAY });
  for (const [daysAgo, value] of [[105, 71], [75, 74], [45, 79], [14, 84]] as const) await store.metrics.record(pickup, value, now - daysAgo * DAY);
  const tickets = await store.metrics.add({ name: "Portal support tickets per week", unit: "", target: 40, higherIsBetter: false, at: now - 90 * DAY });
  for (const [daysAgo, value] of [[84, 62], [56, 55], [28, 47], [7, 41]] as const) await store.metrics.record(tickets, value, now - daysAgo * DAY);
}
