# A day in David's life: an end-to-end usability run

2026-11-17. One automated run through a whole working day in the browser preview (sample data),
followed by a "gremlin hour" of the mistakes a tired person makes. The test is
`e2e/a-day-in-the-life.e2e.ts` and runs with the rest of the suite on every push. Run it with
`DAY_SHOTS=1 npx playwright test a-day-in-the-life` to refresh the screenshots and scorecard here.

## How it works

The test plays David: it only clicks what is on screen and types, and counts every click and
keystroke. Each chapter is a real task with a click budget. A chapter fails if it goes over
budget, if the app does not show that the action worked (a notice, a changed count, copied
text), or if the page logs any error.

## The day

| Time | Chapter | What has to happen |
| --- | --- | --- |
| 7:58 | Coffee, and what is waiting | The Overview gives one total, the menu bar's, split into what he owes and what needs a decision, and warns that two leadership dates are slipping. |
| 8:05 | The morning brief | From the Overview to the queue in one click, then the brief: today's meetings, clear an overnight note and a decision, each confirmed with Undo. |
| 8:20 | A thought in the shower | Quick capture opens with the cursor in the box; "Ask Morgan for the Q1 pharmacy cost model", filed as an ask of Morgan, saved with Return. |
| 9:00 | 1:1 with Priya | Her workspace shows the next meeting; add a topic, tick one off as discussed, Escape back to the team. |
| 10:00 | Hand the agents a job | A PRD brief to the lead with the narrative bank attached; progress shows, then it waits for review and the sidebar says so. |
| 10:05 | Not quite: send it back | Feedback goes back, a linked revision runs, he approves it, and the badge clears. |
| 11:30 | The weekly update for Jordan | Two clicks to a copied update that already names the slipping commitment. |
| 14:00 | A number for the CFO deck | Filter the narrative bank to metrics, pick one, copy it. |
| 16:10 | Oops: ticked the wrong promise | Mark the wrong commitment done, then Command-Z puts it back. |
| 17:15 | Hand off to the offshore team | The drafted note is copied with the ticket waiting on his answer. |
| 17:30 | Make Mondays easier | A weekly agent job for the Monday update, shown with its next run. |
| 17:45 | Lights out | The numbers still add up: the ask of Morgan shows under "waiting on others", not on him. |

## Scorecard

| Chapter | Clicks / budget | Keys typed | Time |
| --- | --- | --- | --- |
| 7:58 Coffee, and what is waiting | 0 / 0 | 0 | 0.1 s |
| 8:05 The morning brief | 4 / 4 | 0 | 1.1 s |
| 8:20 A thought in the shower, captured | 4 / 4 | 42 | 0.8 s |
| 9:00 1:1 with Priya | 4 / 6 | 27 | 1.2 s |
| 10:00 Hand the agents a job | 4 / 6 | 84 | 4.1 s |
| 10:05 Not quite: send it back | 3 / 3 | 56 | 2.7 s |
| 11:30 The weekly update for Jordan | 2 / 2 | 0 | 0.8 s |
| 14:00 A number for the CFO deck | 4 / 4 | 0 | 1.2 s |
| 16:10 Oops: ticked the wrong promise | 2 / 3 | 1 | 0.3 s |
| 17:15 Hand off to the offshore team | 2 / 4 | 0 | 0.3 s |
| 17:30 Make Mondays easier | 4 / 4 | 65 | 1.6 s |
| 17:45 Lights out: does it all add up? | 1 / 1 | 0 | 0.1 s |
| **Whole day** | **34** | **275** | |

Thirty-four clicks for a full day of work, and nothing took more than four. Times are the
robot's, not a person's; they show nothing waits on the app.

Screenshots, one per chapter: [01](day-in-the-life/01.jpg) · [02](day-in-the-life/02.jpg) ·
[03](day-in-the-life/03.jpg) · [04](day-in-the-life/04.jpg) · [05](day-in-the-life/05.jpg) ·
[06](day-in-the-life/06.jpg) · [07](day-in-the-life/07.jpg) · [08](day-in-the-life/08.jpg) ·
[09](day-in-the-life/09.jpg) · [10](day-in-the-life/10.jpg) · [11](day-in-the-life/11.jpg) ·
[12](day-in-the-life/12.jpg)

## Gremlin hour

| What the gremlin did | What happened |
| --- | --- |
| Double-clicked Run on an agent job | One run, not two. |
| Pressed Run, Return and Send back with nothing typed | Refused each time; nothing saved. |
| Mashed Escape and ? on five pages | **Found a bug** (below). Fixed; now the page always stays usable. |
| Captured an emoji, quotes, `<b>` tags and a 300-word sentence | Stored and shown exactly as typed; the tags show as text. |
| Pressed Undo, then Command-Z again with nothing left to undo | No harm done. |
| Raced through eight pages faster than they draw | Landed on the right page, no errors. |
| Shrank the window to its smallest size | No sideways scrolling; the agent brief is still reachable. |

## What it found, and what changed

| # | Finding | Severity | Status |
| --- | --- | --- | --- |
| 1 | Opening the shortcuts list again quickly and pressing Escape twice left an invisible layer over the page that swallowed every click. The app looked frozen until reloaded. The capture dialog could do the same. | High | Fixed: both dialogs are now removed entirely when closed, so no half-finished animation can stay behind. Covered by the gremlin test. |
| 2 | The capture dialog says "Return to save", but after picking a kind, person or project from its lists, Return did nothing. | Medium | Fixed: Return saves from those lists too. |
| 3 | "(7 captured, 4 need your decision)" read as if any capture counts toward what is waiting on him. The test's own author expected an ask of Morgan to raise it. | Low | Fixed: now "(7 you owe, 4 need your decision)". |
| 4 | Filing a capture against a person takes two separate lists (kind, then person). | Low | Idea for later: typing "@Morgan" or "ask:" in the text could fill them in. |

Not a problem: a screenshot looked as if the page faded after Undo. Measured, the cards stay
fully visible through done and undo; the picture had caught the page's entrance animation.
