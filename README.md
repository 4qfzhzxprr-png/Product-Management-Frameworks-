# Daily Work

A personal menu bar app for a product leader: a manager's command center that shows what is
waiting on you, with everything stored locally on the Mac. The full plan is in
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
  evening, what has gone three days without a reply) and the decision queue (three lists you can
  move items between or dismiss from). Both read activity synced from connected systems, so
  in the Mac app they are empty until a connector exists. Any system can be connected by
  writing one small adapter; see `src/core/connectors.ts`. The sorting is rule-based, with no AI.
- **Team.** One card per PM: what they need from you, what you are waiting on, their wins and your
  last 1:1 note. Epics will appear here once an issue tracker is connected.
- **Analytics.** Captures per day or week over 7 days, 30 days or 13 weeks, with totals for the period.
- **Captures.** Browse and search captures by person, project, open items and wins. Mark
  commitments and asks done.
- **Menu bar item.** Shows how many open commitments and asks of you there are.

Every number comes from the captures stored on the Mac. Nothing connects to Gmail, Calendar,
Jira or Confluence yet, and no data leaves the Mac.

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
npm test        # storage tests
npm run dev     # the UI alone in a browser at localhost:1420, with invented sample data that is not saved
```

## Layout

- `src/core`: models, storage and the dashboard's calculations. No UI, no platform code. Tested.
- `src/platform`: everything that differs between the Mac app and a browser tab.
- `src/ui`: the pages, shared components and the capture form. `styles.css` holds the design tokens.
- `src-tauri`: the wrapper: menu bar item, global shortcut, windows, permissions.
