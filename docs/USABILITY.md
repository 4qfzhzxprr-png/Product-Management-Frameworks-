# Usability test, 2026-11-17

## Method

A task-based walkthrough of the browser preview at the smallest normal window (1240 by 860),
playing David on an ordinary day. Each task was done the way a person would do it, by clicking
visible labels, and scripted with Playwright so the click count is exact. Every screen was also
reviewed against common usability heuristics: can a new user tell what to do first, do the
numbers agree, can each page be found without knowing it exists.

This is an expert review, not a test with David. It cannot tell us whether the words match how
he thinks about his work; his first day on the Mac app is the real test (see "Next" below).

## Tasks

| # | Task | Done | Clicks |
|---|------|------|--------|
| 1 | Morning: what needs my decision from email? | Yes | 1 |
| 2 | Clear one decision | Yes | 1 |
| 3 | Capture a promise with a due date, from anywhere | Yes | 4 |
| 4 | Prepare for a 1:1 with Priya: add a topic, see when we meet | Yes | 3 |
| 5 | Is any leadership commitment slipping, and why? | Yes | 1 |
| 6 | Copy the weekly update for the CPO | Yes | 2 |
| 7 | Find a metric for a deck | Yes | 2 |
| 8 | Give an existing commitment a date | Yes | 4 |
| 9 | End of day: copy the handoff note | Yes | 2 |
| 10 | Change who I report to | Yes | 3 |

Every task was finished, none took more than four clicks, and no page logged an error.

## Findings

Severity: **High** blocks or misleads; **Medium** slows David down or makes him hunt;
**Low** polish.

| # | Finding | Severity | Status |
|---|---------|----------|--------|
| 1 | **A new install gives no direction.** The first screen says "You're all clear" with every number at zero. Nothing says that the calendar, tickets, PMs and manager need setting up, or where. | High | Fixed: a "Get set up" strip on the Overview with five steps (connect a calendar, import tickets, add PMs, choose who you report to, try quick capture). Each step opens the page where it is done, ticks itself off from what is stored, and the strip can be hidden for good. |
| 2 | **"Waiting on you" meant three different numbers.** The Overview counted open captures (7), the Queue badge counted email needing a decision (4), and the menu bar added both (11). David would see 11 in the menu bar and 7 on screen. | High | Fixed: the Overview's first line now gives the menu bar's number and splits it ("11 items are waiting on you (7 you owe, 4 need your decision)"), with a link to the queue. The hero says "captures" so it no longer reads as the same total. |
| 3 | **Twelve pages in one flat list.** The sidebar gave no hint which pages are daily and which are weekly or set-up-once, so each one had to be read to be found. | Medium | Fixed: the sidebar is grouped under Today (Overview, Brief, Queue, Commitments, Captures), Team (Team, Delivery, Handoff), Upward (Leadership, Influence, Analytics) and Setup (Connections). Every page is still one click away, and the sidebar still fits without scrolling. |
| 4 | "Change who I report to" is only found under Leadership, 1:1 prep. | Low | Covered by the setup step, which opens Leadership. Revisit if David looks for it in settings. |
| 5 | Handoff needs the offshore time zone before it says anything useful, and the prompt to choose one is easy to read past. | Low | Fixed in the polish pass: the empty state has a "Choose time zone" button that opens the list, and the field is highlighted until set. |
| 6 | Overview, Brief and Queue overlap: all three list things waiting on David. | Low | Open, by design for now: Overview is the summary, Brief the morning read, Queue the working list. Merge if David only ever uses one. |
| 7 | The capture form offers ten kinds in one list. | Low | Open. The four everyday kinds come first; see whether David uses the rest before trimming. |
| 8 | Queue rows use icon-only buttons (move, dismiss). They have names for screen readers and tooltips, but not visible labels. | Low | Partly fixed: "Dismiss" is now "Clear", the move icon is a two-way arrow, and every clear can be undone. Visible labels left out to keep rows one line. |

## Polish pass, 2026-11-17 (overnight)

A second sweep screenshotted every page in light and dark mode, at the smallest normal
window, on a fresh install and with sample data, and tabbed through each page with the
keyboard. Changes made:

- **Undo everywhere it matters.** Marking a capture done, clearing or moving a synced item,
  deleting a capture, saving a new capture and editing one all show a short notice with Undo
  (also Command-Z). A deleted capture comes back exactly as it was.
- **Ask before lasting deletes.** Removing a person or project, deleting a roadmap item,
  priority or pre-read, and taking an executive off the stakeholder map now ask first.
- **Empty pages offer the next step.** Brief, Queue, Delivery and the shipped log link straight
  to Connections; Handoff opens its time zone list from a button.
- **Less repetition on Leadership.** The full "tell the CPO" banner shows on the weekly update
  only, one line on Priorities and Shipped, and not at all where each slip is already listed.
- **Clearer controls.** Neutral tags and counts have a visible tint; the PM toggle is dashed
  when off; deletes use a trash icon that turns red on hover; queue rows keep their source on
  one line with the full text on hover; "Since your last 1:1" lists wins and decisions one per
  line.
- **Keyboard.** Escape leaves a 1:1 workspace; "?" opens a list of shortcuts. Every control
  showed a visible focus ring.

## A day in David's life, 2026-11-17

An end-to-end story test of a whole working day plus a "gremlin hour" of mistakes; see
[`usability/DAY-IN-THE-LIFE.md`](usability/DAY-IN-THE-LIFE.md). A full day took 34 clicks. It
found and fixed a dialog layer that could freeze the page, Return not saving from the capture
lists, and an ambiguous "captured" in the waiting total (now "you owe").

## Checked by

- `e2e/usability.e2e.ts`: the setup steps lead to the right pages, tick off and stay hidden once
  dismissed; the sidebar is grouped and fits; the Overview's total matches the menu bar's.
- The full Playwright suite and unit tests pass with the changes.
- Screenshots: `docs/usability/first-run.png` and `docs/usability/overview.png`.

## Next

On David's first day with the Mac app, note where he hesitates and which pages he opens without
being asked. Three questions to answer then:

1. Does he use the Brief or the Overview in the morning, or both?
2. Do the group names (Today, Team, Upward, Setup) match how he thinks about his week?
3. Which capture kinds does he actually use?
