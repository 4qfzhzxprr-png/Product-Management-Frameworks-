# Daily Work App: Claude Code Handover

2026-11-15 · David Noltemeyer

Source: https://claude.ai/artifact/VTzK7zAVBD2ZWJakHqPDgV (this file is a copy; the doc is the original).

## Purpose

This doc moves the daily work app from planning into build. It records who the app is for, the feature set, the build order, and the decisions still open.

Claude Code should treat Phase 1 as the build target. Later phases are context for architecture choices, not work to start now.

Nothing has been built. There is no code, repo, or chosen tech stack yet.

## Context

The app serves one user: David, a product leader at RazorMetrics, a healthcare company.

- **Role.** Manages a team of product managers.
- **Teams.** Onshore and offshore. The offshore team works while David is offline, so overnight activity and end-of-day handoffs carry real cost when missed.
- **Reporting line.** Reports to the Chief Product Officer. Two goals sit above the team: clear communication with the CPO, and influence with the C-suite.
- **Company tools.** Google Workspace for email and calendar, Confluence for documents, Jira for delivery tracking.
- **Device.** A MacBook. The app is a personal tool, not a team product.

## Product concept

The app is a manager's command center, not a personal to-do list. It is built around two facts of David's day: PMs who need decisions from him, and an offshore team that works while he sleeps.

- **Form.** A menu bar app with a main window. The menu bar shows a count of items waiting on David. The main window holds the full views.
- **Storage.** Local-first. Notes, captures, and 1:1 history stay on the Mac.
- **Posture.** Read-only against company systems to start. Anything the app drafts for sending is edited and sent by David.
- **Daily loop.** Open it each morning, see what changed overnight, clear decisions, capture notes through the day.

## Phase 1 scope

Phase 1 is five features that make the app worth opening every morning. All of it is read-only against company systems. The acceptance criteria below are proposed and open to edits.

| Feature | What it does | Done when |
| --- | --- | --- |
| Connectors | Read-only links to Gmail, Google Calendar, Jira, and Confluence | David signs in once per system. Data syncs on launch and on a timer. One failed connector does not block the others. |
| Morning brief | Shows what happened overnight: offshore emails, Confluence pages edited or commented on, and anything waiting on David | It fits one screen and reads in two minutes. Every item links to its source. |
| Decision queue | Sorts email and Confluence mentions into three buckets: needs my decision, waiting on someone else, FYI | Items land in a bucket automatically. David can move or dismiss any item. |
| Quick capture | A global hotkey to log a thought, commitment, or note against a person or project | Capture works without opening the main window. Notes can carry a "win" tag, which seeds the narrative bank for Phase 4. |
| Team board with PM portfolio view | One card per PM: what they own, the health of their Jira epics, open asks in both directions, and notes from the last 1:1 | Epics come from Jira. Notes and asks come from quick capture. |

The menu bar count of items waiting on David ships with Phase 1.

Out of scope for Phase 1: anything that writes to or sends from Gmail, Jira, or Confluence, and any feature listed in later phases.

## Roadmap after Phase 1

Three rules set the order: read-only features before anything that writes or sends, daily-use features before weekly ones, and data sources before the features that depend on them.

### Phase 2: Team and delivery

| Feature | What it does |
| --- | --- |
| Delivery pulse | Sprint progress per team, onshore and offshore, with what is at risk of missing |
| Blocker radar and stale ticket sweep | Offshore questions unanswered through a full cycle, plus Jira tickets blocked or waiting on a product answer, sorted by age |
| 1:1 workspace | Running agenda per PM, commitments in both directions, topics carried over |
| Commitment tracker | Promises made by David or a PM in email or meetings, with owner and date, flagged when they slip |
| Review tracker | Specs and PRDs awaiting David's review, with how long each has waited |
| Handoff window | Timezone overlap, what must go to offshore before David's day ends, and a drafted end-of-day handoff note he edits and sends |

### Phase 3: The CPO

These depend on the Jira data from Phase 2 being trustworthy.

| Feature | What it does |
| --- | --- |
| Shipped log | Everything released each week, pulled from Jira |
| Weekly update drafter | Drafts the week's shipped work, risks, and decisions in the CPO's preferred format |
| Boss 1:1 prep | Open asks, decisions needed, and what David promised last time |
| Priority map | The CPO's stated priorities with the team's work mapped against each |
| Roadmap vs. reality with slip detector | Roadmap items mapped to epics, showing progress against the date given to leadership, and flagging growing scope or stalled tickets |
| No-surprises alert | Flags a slipping epic tied to a leadership commitment, so the CPO hears it from David first |

### Phase 4: C-suite influence

| Feature | What it does |
| --- | --- |
| Narrative bank | Wins, customer evidence, and metrics collected as they happen, ready for a deck |
| Stakeholder map | Each executive's goals, concerns, and what they last asked about |
| Exec translator | Rewrites a product update for each audience: revenue for the CEO, cost and margin for the CFO, pipeline for sales |
| Pre-read builder | One-page briefs for exec meetings with the ask stated up front |
| Objection prep | Likely pushback on a proposal with drafted answers |

### Two adjustments under consideration

- **Start the narrative bank in Phase 1** as a tag in quick capture, so Phase 4 does not start empty. This is already reflected in the Phase 1 scope.
- **Swap Phases 2 and 3** if visibility with the CPO matters more than time savings. The weekly update could ship sooner on a thinner delivery pulse. Not decided.

## Later or cut

Ten features are parked. Each is either a nice-to-have or hard to do well. They should not shape Phase 1 design.

| Feature | What it does | Why it waits |
| --- | --- | --- |
| Meeting prep | Attaches relevant Confluence docs and email threads to each meeting on today's calendar | Useful, not essential to the daily loop |
| End-of-day close | What moved, what did not, and tomorrow's top three | Nice-to-have |
| Async decision log | Captures decisions made in email threads so neither team reopens them | Hard to detect decisions reliably |
| Workload view | Who is carrying what across the PM team | Partly covered by the PM portfolio view |
| Coaching log | Private notes on wins, misses, and growth areas per PM | Can live as tagged quick-capture notes for now |
| Spec quality check | First-pass read of a PRD against David's standards | Needs those standards written down first |
| Spec to ticket trace | Links each Confluence PRD to its Jira epics | Depends on consistent linking habits |
| Overlap planner | Who is online now and the best slot for a live conversation | Small gain |
| Focus guard | Where the week went: meetings, deep work, reactive email | Nice-to-have |
| Ask anything | One search box across email, Confluence, and notes | A big build on its own |

## Integrations and access

The app reads from four systems through two sign-ins. Access has not been requested or confirmed for any of them, and that check comes before design work.

| System | Feeds | Access |
| --- | --- | --- |
| Gmail | Morning brief, decision queue, commitment tracker | Google OAuth, read-only. The Workspace admin may need to approve the app. |
| Google Calendar | Meeting prep, handoff window, focus guard | Same Google sign-in |
| Jira | Team board, delivery pulse, shipped log, slip detection | Atlassian API token |
| Confluence | Morning brief, review tracker, decision queue | Same Atlassian token as Jira |

The single Atlassian token assumes the company runs Atlassian Cloud. Confirm that before building the connector.

## Data and security

The main risk is company email and documents leaving the laptop. RazorMetrics is in healthcare, so IT or security should clear the design before any real data flows through it. That clearance has not been sought yet.

- **AI summarization.** Any feature that summarizes or drafts with an AI model sends email and document content to that model's provider. This needs explicit approval.
- **Local storage.** Notes, captures, 1:1 history, and synced data stay on the Mac.
- **Credentials.** Store tokens in the macOS Keychain, never in plain files or the repo.
- **Read-only first.** No feature writes to or sends from a company system in Phase 1. Later drafting features produce text David reviews and sends himself.
- **Private notes.** Coaching notes and stakeholder notes are sensitive and must never sync anywhere.

## Open decisions

Eight questions are unanswered. The first four block the build.

- [ ] **Tech stack.** Native SwiftUI, or a cross-platform shell such as Tauri or Electron. Not discussed in depth.
- [ ] **AI provider.** Which model does the summarizing, and whether company policy allows it.
- [ ] **Google access.** Whether the Workspace admin will approve OAuth for a personal app.
- [ ] **Atlassian setup.** Cloud or self-hosted, and whether personal API tokens are allowed.
- [ ] **Phase 1 list.** Confirm the five features, or trade one out.
- [ ] **Phase order.** Keep team and delivery second, or move the CPO features up.
- [ ] **Team details.** Number of PMs, how Jira epics map to each PM, and the offshore team's time zone.
- [ ] **CPO update format.** What the weekly update should look like, needed before Phase 3.

## First steps for Claude Code

Start by settling the blocking decisions, then build Phase 1 one feature at a time against real data.

1. Read this doc, then ask David the four blocking questions under Open decisions.
2. Propose a tech stack with a short rationale and wait for his approval.
3. Scaffold the app: menu bar item, main window, local database.
4. Build quick capture first. It needs no company access, so it works even if approvals take time.
5. Add the Jira and Confluence connector, read-only.
6. Add the Gmail and Calendar connector, read-only.
7. Build the morning brief on real data.
8. Build the decision queue.
9. Build the team board with the PM portfolio view.
10. Have David use it for a week, then adjust before starting Phase 2.

Keep a copy of this doc in the repo as markdown so every Claude Code session starts with the same context.
