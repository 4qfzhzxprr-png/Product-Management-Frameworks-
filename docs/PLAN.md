# Daily Work: project plan

Last updated 2026-11-16.

This is the full plan for the Daily Work app: every phase, what is in and out of scope, what
is built, and what is left. [HANDOVER.md](HANDOVER.md) is the original brief this grew from;
where the two differ, this file is current.

## What the app is

A personal Mac app for one user: David, a product leader at RazorMetrics who manages a team
of product managers across onshore and offshore teams and reports to the Chief Product
Officer.

It is a manager's command center, not a to-do list. It is built around two facts of his day:
PMs who need decisions from him, and an offshore team that works while he sleeps.

- **Form.** A menu bar item showing how much is waiting on him, a main window with the full
  views, and a small capture window on a global shortcut.
- **Daily loop.** Open it each morning, see what changed overnight, clear decisions, capture
  notes through the day, hand off before signing off.
- **Local-first.** Notes, captures and synced data are stored on the Mac.
- **Read-only.** The app never writes to or sends from another system. Anything it drafts is
  edited and sent by David.

## Status at a glance

| Stage | State |
| --- | --- |
| Phase 1: the daily loop | Built. Shows real data for captures; the synced-data pages wait for connectors. |
| Phase 2: team and delivery | Built, apart from the parts that need connectors or AI. |
| Phase 3: the CPO | Not started. Next. |
| Phase 4: C-suite influence | Not started. One piece seeded (the win tag). |
| Connecting to other systems | Framework built and tested. No real connector yet. |
| AI features | Not started. Waiting on an approved provider. |
| Apple distribution | Unsigned test builds only. |

Nothing has been run on a Mac yet. Everything below marked "built" has passed automated
tests in a browser and, for the wrapper, on Linux under a virtual display.

## Ground rules

These apply to every phase.

1. **Connectors come last.** Every feature is built against the app's own neutral records
   first. Real connectors are written at the end.
2. **Connect to anything.** Nothing outside a connector may name or assume a particular
   system. Gmail, Google Calendar, Jira and Confluence are the first systems expected, not
   the only ones.
3. **Read-only before anything that writes or sends.** Drafting features produce text David
   reviews and sends himself.
4. **Daily-use features before weekly ones.**
5. **No AI calls until a provider is approved.** Until then, sorting and drafting are
   rule-based, and any model use will sit behind one interface.
6. **Company data stays on the laptop** unless IT or security has cleared where it goes.
   Tokens go in the Mac Keychain, never in files or the repository.
7. **Numbers on screen are real.** Invented sample data exists only in the browser preview,
   where it is labelled.

## Phase 1: the daily loop

The goal is an app worth opening every morning.

| Feature | Scope | State |
| --- | --- | --- |
| Quick capture | A global shortcut (Control-Option-Space) opens a small window to log a thought, commitment, ask, 1:1 note or 1:1 topic against a person and a project, with an optional due date and a "win" tag. Works without opening the main window. | Built |
| Menu bar count | The number of open commitments and asks of David, plus synced items needing his decision. | Built. Not yet seen on a Mac. |
| Morning brief | One screen: what needs his decision, what is awaiting his review, what happened since 6pm on the last working day, and what he asked for that has gone three days without a reply. Every item links to its source. | Built. Empty until a connector exists. |
| Decision queue | Synced activity sorted into three lists: needs my decision, waiting on someone else, FYI. He can move or dismiss any item; a moved item stays put through later syncs. | Built. Sorting is rule-based and untested on real mail. |
| Team board | One card per PM: what they need from him, what he is waiting on, recent wins, the last 1:1 note, and their epics with a health call. | Built. Epics appear once an issue tracker is connected. |
| Connectors | Read-only links to other systems, signed in once each, syncing on launch and on a timer, where one failure does not block the others. | Framework built. See "Connecting to other systems". |

Also built in this phase, beyond the original brief:

- **Overview.** A landing page with what is waiting on him, how much he cleared this week and
  four headline counts.
- **Analytics.** Captures per day or week over 7 days, 30 days or 13 weeks, with a table view.
- **Captures.** Browse, search, filter, edit, star and delete everything captured, and manage
  people and projects.

Out of scope for Phase 1: anything that writes to or sends from another system.

## Phase 2: team and delivery

The goal is to see how delivery is going across both teams and keep track of what David and
his PMs owe each other.

| Feature | Scope | State |
| --- | --- | --- |
| 1:1 workspace | Per PM: a running agenda whose undiscussed topics carry over, commitments in both directions, and 1:1 notes over time. | Built |
| Delivery pulse | Sprint progress per team, with the tickets at risk of missing and why. | Built on neutral ticket records. Empty until a tracker is connected. |
| Blocker radar and stale ticket sweep | Tickets blocked or waiting on a product answer, longest stuck first, and in-progress tickets untouched for a week. | Built, same condition. The "offshore questions unanswered through a full cycle" half is covered by the brief's three-day list, which also waits on a connector. |
| Commitment tracker | Open promises in both directions with owner and due date, flagged once they slip. | Built for promises David captures. Finding promises inside email or meeting notes needs AI. |
| Review tracker | Specs and PRDs awaiting his review, longest wait first. | Built as a rule-based list in the morning brief. Needs a connector for real data. |
| Handoff window | The hours his day shares with the offshore team, what to send them before he signs off, and a drafted end-of-day note he edits, copies and sends. | Built from working hours and time zones he sets. It does not read calendars yet, so it does not know about meetings. |

Epics are matched to a PM by the owner's name as the tracker shows it. If names differ, the
fix is name aliases on people, not tracker-specific code.

## Phase 3: the CPO

The goal is clear communication with the CPO and no surprises. Not started. These depend on
ticket data being trustworthy, so they will be built on the same neutral ticket records as
Phase 2.

| Feature | Scope | Needs |
| --- | --- | --- |
| Shipped log | Everything released each week, pulled from the tracker. | A release date or "done" date on ticket records. |
| Weekly update drafter | Drafts the week's shipped work, risks and decisions in the CPO's preferred format, for David to edit and send. | The CPO's format (a past update is enough). A rule-built first version needs no AI; better prose does. |
| Boss 1:1 prep | Open asks, decisions needed, and what David promised last time. | Nothing new: it reuses the 1:1 workspace with the CPO as the person. |
| Priority map | The CPO's stated priorities with the team's work mapped against each. | A place to record priorities and link epics to them. |
| Roadmap vs. reality, with slip detector | Roadmap items mapped to epics, showing progress against the date given to leadership, flagging growing scope or stalled tickets. | A roadmap record with committed dates; scope history on epics. |
| No-surprises alert | Flags a slipping epic tied to a leadership commitment, so the CPO hears it from David first. | The roadmap record above. |

## Phase 4: C-suite influence

The goal is influence with the executive team. Not started.

| Feature | Scope | Needs |
| --- | --- | --- |
| Narrative bank | Wins, customer evidence and metrics collected as they happen, ready for a deck. | Seeded: captures can already be tagged as wins. Needs evidence and metric fields, and an export. |
| Stakeholder map | Each executive's goals, concerns and what they last asked about. | Private notes that never sync anywhere. |
| Exec translator | Rewrites a product update for each audience: revenue for the CEO, cost and margin for the CFO, pipeline for sales. | AI. |
| Pre-read builder | One-page briefs for exec meetings with the ask stated up front. | AI for drafting; a template works without it. |
| Objection prep | Likely pushback on a proposal with drafted answers. | AI. |

## Later or cut

Parked. Each is a nice-to-have or hard to do well. They do not shape current design.

| Feature | Scope | Why it waits |
| --- | --- | --- |
| Meeting prep | Attaches relevant documents and email threads to each meeting on today's calendar. | Useful, not essential to the daily loop. |
| End-of-day close | What moved, what did not, and tomorrow's top three. | Nice-to-have. The handoff window covers part of it. |
| Async decision log | Captures decisions made in email threads so neither team reopens them. | Hard to detect decisions reliably. |
| Workload view | Who is carrying what across the PM team. | Partly covered by the team board. |
| Coaching log | Private notes on wins, misses and growth areas per PM. | Lives as 1:1 notes and tagged captures for now. |
| Spec quality check | First-pass read of a PRD against David's standards. | Needs those standards written down, and AI. |
| Spec to ticket trace | Links each PRD to its epics. | Depends on consistent linking habits. |
| Overlap planner | Who is online now and the best slot for a live conversation. | Small gain. The handoff window shows shared hours. |
| Focus guard | Where the week went: meetings, deep work, reactive email. | Nice-to-have. |
| Ask anything | One search box across email, documents and notes. | A big build on its own. |

## Connecting to other systems

Done last, by David's decision, and built so that any system can be added.

**Built**

- One connector contract: an adapter per kind of system declares the fields a user fills in
  and has a single read-only sync.
- Neutral records that every page reads: activity (email, comments, mentions, review
  requests) and work items (tickets and epics).
- Several connections per connector, each with its own name, last sync time and last error.
- A sync that runs every connection independently, so one failure never blocks the rest.
- Secrets kept apart from the database.

**To build**

1. A Keychain-backed secret store.
2. A request layer for the Mac app (the web view cannot call other sites directly).
3. A screen to add, pause and remove connections, showing each one's status.
4. A sync timer, and sync on launch.
5. The first connectors. Expected: a mail connector, a calendar connector, an issue tracker
   connector and a wiki connector. Which products they target depends on the open questions
   below.
6. A neutral calendar record, so the handoff window and meeting features can see meetings.
7. Name aliases on people, for matching epic owners.
8. Removing tickets that were deleted in the tracker.
9. Tuning the decision-queue rules against real mail.

## AI features

Not started. Blocked on an approved provider, because any AI summarizing or drafting sends
email and document content to that provider.

Waiting on it: finding promises inside email and meeting notes, better prose in the weekly
update, the exec translator, the pre-read builder, objection prep, and the spec quality
check. Everything built so far is rule-based and makes no AI calls.

## Apple distribution

Each push builds an unsigned Mac app for testing. Still to do:

1. Decide the route: the Mac App Store, or a signed and notarized download. The App Store
   adds sandbox restrictions that affect the global shortcut, the Keychain and network access.
2. A real bundle identifier and an Apple Developer account to sign with.
3. Signing and notarization in the build.
4. Sandbox entitlements, if the App Store route is chosen.
5. An update mechanism for the download route.

## Technology

- A web app (React and TypeScript) inside a thin Tauri wrapper. Swift was ruled out. The
  wrapper supplies the menu bar item, the global shortcut, the windows and the app bundle;
  all product logic is TypeScript.
- Local SQLite storage.
- Ant Design controls on a glass layout in RazorMetrics' colors.
- Unit tests for the logic behind each page, an end-to-end suite that drives every page in a
  browser, and a Mac build, all run on every push.

## Open questions for David

| Question | Blocks |
| --- | --- |
| Which AI provider is approved, and for what data? | All AI features. |
| Is Atlassian on Cloud or self-hosted, and are personal API tokens allowed? | The tracker and wiki connectors. |
| Will the Workspace admin approve read-only access to mail and calendar for a personal app? | The mail and calendar connectors. |
| Has IT or security cleared the design? | Any real company data flowing through the app. |
| Mac App Store, or a signed download? | Distribution work. |
| What format does the CPO expect for the weekly update? | The weekly update drafter. |
| How many PMs are there, and how do epics map to each one? | Checking the team board against reality. |
| What is the offshore team's time zone, working hours, and team name in the tracker? | Handoff settings (can be set in the app). |

## Suggested order from here

1. Run the current build on a Mac and note what looks or behaves wrong.
2. Phase 3, starting with the pieces that need nothing new: boss 1:1 prep, then the shipped
   log and a rule-built weekly update once the CPO's format is known.
3. Phase 3's roadmap features: priority map, roadmap vs. reality, no-surprises alert.
4. Phase 4's non-AI pieces: narrative bank and stakeholder map.
5. Connecting: the secret store, request layer, connections screen and sync timer, then one
   connector at a time, tracker first because the most pages depend on it.
6. AI features, once a provider is approved.
7. Apple distribution.
8. A week of real use, then adjust.
