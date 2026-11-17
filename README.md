# Daily Work

A personal menu bar app for a product leader: a manager's command center that shows what is
waiting on you, with everything stored locally on the Mac. The full plan, with every phase, its scope
and what is built, is in [docs/PLAN.md](docs/PLAN.md); the original brief is
[docs/HANDOVER.md](docs/HANDOVER.md).

It is a web app (React and TypeScript) inside a thin [Tauri](https://tauri.app) wrapper, which
supplies the menu bar item, the global shortcut and the Mac app bundle. Controls come from
[Ant Design](https://github.com/ant-design/ant-design); the glass look is the app's own CSS.

## What exists so far

- **Quick capture.** Control-Option-Space from any app opens a small window. Type a thought,
  commitment, ask or 1:1 note, optionally attach a person and a project, tag it as a win, and
  press Return.
- **Overview.** What is waiting on you, how much you cleared this week, and four headline counts.
- **Brief and Queue.** The morning brief (what needs your decision, what happened since last
  evening, what is awaiting your review, what has gone three days without a reply) and the decision queue (three lists you can
  move items between or dismiss from). Both read activity synced from connected systems, so
  in the Mac app they are empty until a connector exists. Any system can be connected by
  writing one small adapter in `src/core/connectors/`. The sorting is rule-based, with no AI.
- **Team.** One card per PM: what they need from you, what you are waiting on, their wins and your
  last 1:1 note. Each card also lists the PM's epics with a health call once an issue tracker is connected.
- **1:1 workspace.** Open it from a PM's card: a running agenda whose untouched topics carry over,
  what each of you owes the other, and your 1:1 notes over time.
- **Leadership.** For the CPO: a weekly update drafted from what is stored, in a format you set;
  prep for your 1:1; the CPO's priorities with the work mapped to each; the roadmap with the
  dates given to leadership, flagged with reasons when they slip; and a weekly shipped log.
- **Influence.** A narrative bank of wins, customer evidence and metrics to copy into decks; a
  stakeholder map of what each executive wants, worries about and last asked for; and one-page
  pre-reads that lead with the ask. Private to this Mac.
- **Commitments.** Every open promise in both directions. Give one a date when you capture or edit
  it, and it is flagged once it slips.
- **Delivery.** Sprint progress per team, what is at risk of missing, everything blocked or waiting on
  a product answer, and in-progress tickets nobody has touched for a week. Empty until an issue
  tracker is connected.
- **Handoff.** When your working day overlaps the offshore team's, what to send them before you
  sign off, and a draft end-of-day note to edit, copy and send yourself. Set the offshore time
  zone and hours on the page.
- **Analytics.** Captures per day or week over 7 days, 30 days or 13 weeks, with totals for the period.
- **Captures.** Browse and search captures by person, project, open items and wins. Mark
  commitments and asks done.
- **Menu bar item.** Shows how many open commitments and asks of you there are.

- **Connections.** Add, pause, sync and remove connections to other systems. The first is any
  calendar that can publish an iCalendar (.ics) address; its meetings show on the Handoff page.
  Secrets go in the Mac Keychain. Nothing is ever written back to a connected system.

Every number comes from what is stored on the Mac. Only calendars can be connected so far; mail,
issue trackers and wikis come next. No data leaves the Mac.

## Build and run on a Mac

Needs [Node 20+](https://nodejs.org), [Rust](https://rustup.rs) and the Xcode command line tools.

```sh
npm install
npm run tauri dev      # run with live reload
npm run tauri build    # build Daily Work.app and a .dmg under src-tauri/target/release/bundle
```

Each push also builds the Mac app on GitHub Actions; download it from the run's artifacts. That
build is unsigned, so the first launch needs right-click, Open.

Data lives in `~/Library/Application Support/app.dailywork.desktop/dailywork.db`.

## Other commands

```sh
npm test        # unit tests for storage and the calculations behind each page
npm run e2e     # end-to-end tests: drives every page in a browser (first run: npx playwright install chromium)
npm run dev     # the UI alone in a browser at localhost:1420, with invented sample data that is not saved
                # (add ?empty to the address to start blank, like a new install)
```

## Layout

- `src/core`: models, storage and the dashboard's calculations. No UI, no platform code. Tested.
- `src/platform`: everything that differs between the Mac app and a browser tab.
- `src/ui`: the pages, shared components and the capture form. `styles.css` holds the design tokens.
- `src-tauri`: the wrapper: menu bar item, global shortcut, windows, permissions.
