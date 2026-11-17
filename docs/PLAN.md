# Daily Work: project plan

Last updated 2026-11-17 (Claude approved as the AI provider; Phase 5, the agent team, scoped).

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
| Phase 3: the CPO | Built, apart from the parts that need connectors or AI. |
| Phase 4: C-suite influence | Built, apart from the three features that need AI. |
| Connecting to other systems | Plumbing and Connections screen built; calendars connect, and tickets import from any tracker's CSV export. |
| AI features | Not started. Claude is the approved provider (2026-11-17); calls go through Claude Code on the Mac first. |
| Phase 5: the agent team | Scoped 2026-11-17, not started. See below. |
| Apple distribution | Unsigned test builds only. |
| Usability | Expert walkthrough and an overnight polish pass done 2026-11-17 (`docs/USABILITY.md`). A session with David is next. |

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
5. **AI goes through one interface, and only to Claude.** Claude (Anthropic) is the approved
   provider (David, 2026-11-17). Every model call sits behind one interface; nothing calls a
   model from a page. Sorting and drafting stay rule-based until a feature is built on it.
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

The goal is clear communication with the CPO and no surprises. Built on the same neutral
ticket records as Phase 2, on a new Leadership page with five tabs.

| Feature | Scope | State |
| --- | --- | --- |
| Shipped log | Tickets finished each week, grouped under their epics, with epics finished that week. Four weeks back. | Built. Tickets now carry the date they were finished. Empty until a tracker is connected. |
| Weekly update drafter | Drafts the week's shipped work, wins, risks, decisions, upcoming roadmap dates and asks of the CPO, for David to edit, copy and send. The format is his to set: rename, reorder or switch off sections, and change the first line. Saved for next week. | Built, rule-based. Defaults are a guess until the CPO's real format is known. Better prose needs AI. |
| Boss 1:1 prep | Choose the person David reports to; see the agenda, what each side owes, slipping commitments to raise, and what changed since the last 1:1 (tickets shipped, wins, decisions). Opens the full 1:1 workspace for that person. | Built |
| Priority map | The CPO's priorities in their order, each with the epics linked to it and their health, plus open epics that serve no priority. | Built. Linking epics needs a tracker. |
| Roadmap vs. reality, with slip detector | Roadmap items with the date given to leadership, linked to epics. Each shows progress and a state (on track, at risk, late, done) with the reasons in plain words: past the date, an epic past its own due date, stuck tickets, scope grown since linking, nothing moving for a week, or behind pace for the time used. | Built |
| No-surprises alert | Leadership commitments that are late or at risk, shown on the Overview, as a count on the Leadership menu item, and at the top of the Leadership page. | Built |

Also added: a "Decision" capture kind, so decisions made during the week feed the update.

Rules worth knowing:

- Epics are linked by the tracker's own key, so links survive a re-sync. If a connection is
  removed and added again under a different name, links need redoing.
- "Scope grew" compares today's ticket count with the count when the epic was linked.
- "Behind pace" compares the share of tickets done with the share of time used between linking
  and the promised date, and only after a third of the time has passed.

## Phase 4: C-suite influence

The goal is influence with the executive team. Built on a new Influence page with three tabs.
Everything on it is private: stored on the Mac only and never synced.

| Feature | Scope | State |
| --- | --- | --- |
| Narrative bank | Wins, customer evidence and metrics collected as they happen: anything captured as a win, or with the new "Customer evidence" and "Metric" kinds, from the shortcut or the page. Filter by type, period and project; select entries and copy them as plain text grouped by project, ready for a deck. | Built |
| Stakeholder map | Each executive's role, what they are trying to achieve and what worries them, what they last asked David for and whether it is done, when they were last in touch, and a flag after 30 days of no contact. Log an ask from the card, or open notes and an agenda for them. | Built |
| Pre-read builder | A one-page brief for an exec meeting, ask first: the ask, why now, background, options, recommendation, and evidence chosen from the narrative bank. Shows the person's goals and concerns while writing, flags a missing ask, audience or recommendation, and counts words against one page. Saved, copied and sent by David. | Built, from a template. AI could draft the sections. |
| Exec translator | Rewrites a product update for each audience: revenue for the CEO, cost and margin for the CFO, pipeline for sales. | Not built. Needs AI. |
| Objection prep | Likely pushback on a proposal with drafted answers. | Not built. Needs AI. |

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
  requests), work items (tickets and epics) and calendar events.
- Several connections per connector, each with its own name, last sync time and last error.
- A sync that runs every connection independently, so one failure never blocks the rest.
  It runs when the app opens, every 15 minutes, and on "Sync now".
- Secrets (tokens, passwords, secret addresses) in the Mac Keychain, never in the database.
- Requests sent from the native side using the Mac's own TLS, so they trust what the Mac
  trusts, including certificates a company network adds to inspect traffic.
- A Connections screen: add a connection from any installed connector, see each one's last
  sync and error in plain words, pause, sync now, and remove (which deletes what it brought
  in and its Keychain entry). It reminds David to clear company data with IT first.
- **Calendar feed connector.** Reads any calendar that can publish an iCalendar (.ics)
  address: Google Calendar's secret address, a published Outlook or Apple calendar, and
  others. Keeps meetings from a week back to 30 days ahead, expands repeating meetings
  (daily, weekly on chosen days, monthly, yearly) across clock changes, and handles
  exceptions, moved occurrences, cancellations and Outlook's time zone names. Monthly rules
  like "the second Tuesday" or "the last Friday" are expanded too; yearly rules by weekday
  show only their first meeting.
- Meetings are used across the app: today's meetings as a strip at the top of the morning
  brief, and each person's next meeting (preferring one that looks like a 1:1) on their Team
  card, in their 1:1 workspace and in CPO 1:1 prep. Meetings are matched by the person's
  name, or any of their other names, appearing in the meeting title.
- **Other names.** People can have other names (such as "Priya S." in Jira), entered on their
  Team card; epics and meetings match any of them.
- The handoff window now lists today's meetings and how much shared time is left after them.
- **Tickets from a file.** Imports tickets and epics from a CSV export of any tracker (Jira,
  Linear, Asana, Azure DevOps, GitHub and others), with no API access or admin approval.
  Columns are matched by name (including Jira's numeric parent ids and repeated Sprint
  columns) and can be corrected before importing; a preview shows how statuses map and which
  rows are left out and why. Re-importing a newer export replaces the old one, so tickets
  deleted in the tracker disappear. It fills Delivery, epic health on the Team page, the
  shipped log and roadmap progress with real data. Sprint end dates are not in most exports,
  so "not started with the sprint nearly over" cannot fire for imported tickets.

**To build**

1. More connectors. Each is one file in `src/core/connectors/` and one line in the registry.
   Expected next: an issue tracker (the most pages depend on it), mail, and a wiki. Which
   products they target depends on the open questions below.
2. Removing tickets deleted in the tracker, for live tracker connectors (imports already do).
3. Tuning the decision-queue rules against real mail.

## Phase 5: the agent team

Asked for 2026-11-17. David runs a product agent team of nine Claude Code subagents: a lead
that assigns work to eight specialists. He wants one place to see, run and review them.

What David told us:

- The agents are Claude Code subagents (`.claude/agents/*.md` files) kept only on his Mac.
- They work as a lead plus specialists, not a fixed pipeline.
- Jobs take a brief and return a document; some need company data; some should recur; all
  output needs David's sign-off before anyone else sees it.
- Pressing Run should start Claude Code on his Mac with his existing login, not a new API key.
- Scheduled jobs may run only while the Mac is awake and the app is open, catching up at the
  next launch.
- A separate Agents page, not mixed into the PM Team board.
- He will name the nine agents at his Mac; the app should read them from the files.

Scope, in build order:

1. **Roster.** Read the agent files from a folder David chooses (default `~/.claude/agents`),
   one card per agent: name, description, tools, model, the lead marked as lead. The files
   stay the source of truth; the app re-reads them and never edits them.
2. **Jobs and runs.** Start a job with a brief, aimed at the lead or one specialist. The app
   runs Claude Code in its non-interactive mode in the background, records each run (brief,
   agent, start, finish, status, cost and time where reported, output) and shows progress.
   A neutral `AgentRun` record, with the Claude Code runner behind one interface, so a
   Claude API runner can be added later.
3. **Review queue.** Every finished run waits for David: approve, send back with feedback
   (which starts a follow-up run), or reject. A per-agent record of how often work is approved
   first time. Approved output can be copied or saved as a capture.
4. **Schedules.** Recurring jobs (for example a Monday status summary) that run when due while
   the app is open and catch up at the next launch.
5. **Context from the app.** Attach what the app already holds to a brief: tickets and epics,
   captures, the narrative bank, a stakeholder profile.

Guard rails:

- Agents run read-only by default: no file edits, commands or web posts unless David allows a
  tool for that agent. Output always lands in the review queue first.
- Data sent to Claude follows the company's terms for Claude. Customer and patient data is not
  attached unless IT confirms it is allowed.
- Running Claude Code means starting another program on the Mac, which the Mac App Store
  sandbox does not allow. This feature points to the signed, notarized download route.

## AI features

Claude is approved (2026-11-17). The first model calls will be the agent runs in Phase 5,
through Claude Code on David's Mac. Once that runner exists, the features below can use it.

Waiting on it: finding promises inside email and meeting notes, better prose in the weekly
update, the exec translator, objection prep, drafting pre-read sections, and the spec quality
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
| Which data may go to Claude (customer or patient data)? | Attaching such data to agent briefs. |
| The nine agents: names, jobs, and which one is the lead. | Checking the Agents page against reality (read from the files). |
| Is Atlassian on Cloud or self-hosted, and are personal API tokens allowed? | The tracker and wiki connectors. |
| Will the Workspace admin approve read-only access to mail and calendar for a personal app? | The mail and calendar connectors. |
| Has IT or security cleared the design? | Any real company data flowing through the app. |
| Mac App Store, or a signed download? The agent runner needs the download route. | Distribution work. |
| What format does the CPO expect for the weekly update? | The weekly update drafter. |
| How many PMs are there, and how do epics map to each one? | Checking the team board against reality. |
| What is the offshore team's time zone, working hours, and team name in the tracker? | Handoff settings (can be set in the app). |

## Suggested order from here

1. Run the current build on a Mac and note what looks or behaves wrong. Use the three
   questions at the end of `docs/USABILITY.md` while doing it.
2. Import a ticket export from Jira, set the weekly update format to the CPO's, and enter
   the real priorities, roadmap and stakeholders.
3. Remaining low-severity usability items in `docs/USABILITY.md`, once David has used the app.
5. Connecting: the secret store, request layer, connections screen and sync timer, then one
   connector at a time, tracker first because the most pages depend on it.
6. AI features, once a provider is approved.
7. Apple distribution.
8. A week of real use, then adjust.
