# Daily Work

A personal menu bar app for a product leader: a manager's command center that shows what is
waiting on you, with everything stored locally on the Mac. The full plan is in
[docs/HANDOVER.md](docs/HANDOVER.md).

## What exists so far

- **Quick capture.** Control-Option-Space from any app opens a small panel. Type a thought,
  commitment, ask or 1:1 note, optionally attach a person and a project, tag it as a win, and
  press Return.
- **Main window.** Browse and search captures by person, project, open items and wins. Mark
  commitments and asks done.
- **Menu bar item.** Shows how many open commitments and asks of you there are.

Nothing connects to Gmail, Calendar, Jira or Confluence yet, and no data leaves the Mac.

## Build and run

Needs macOS 13 or later and Xcode (or the Xcode command line tools).

```sh
scripts/build-app.sh
open "build/Daily Work.app"
```

To work on it, open `Package.swift` in Xcode and run the `DailyWork` scheme. Run the tests
with `swift test`.

Data lives in `~/Library/Application Support/DailyWork/dailywork.sqlite`.

## Layout

- `Sources/DailyWorkCore`: models and local SQLite storage. No UI.
- `Sources/DailyWork`: the SwiftUI app, the capture panel and the global shortcut.
- `Tests/DailyWorkCoreTests`: storage tests.
