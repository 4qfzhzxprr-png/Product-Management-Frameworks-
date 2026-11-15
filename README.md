# Daily Work

A personal menu bar app for a product leader: a manager's command center that shows what is
waiting on you, with everything stored locally on the Mac. The full plan is in
[docs/HANDOVER.md](docs/HANDOVER.md).

It is a web app (React and TypeScript) inside a thin [Tauri](https://tauri.app) wrapper, which
supplies the menu bar item, the global shortcut and the Mac app bundle.

## What exists so far

- **Quick capture.** Control-Option-Space from any app opens a small window. Type a thought,
  commitment, ask or 1:1 note, optionally attach a person and a project, tag it as a win, and
  press Return.
- **Main window.** Browse and search captures by person, project, open items and wins. Mark
  commitments and asks done.
- **Menu bar item.** Shows how many open commitments and asks of you there are.

Nothing connects to Gmail, Calendar, Jira or Confluence yet, and no data leaves the Mac.

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
npm run dev     # the UI alone in a browser at localhost:1420, with a throwaway in-memory database
```

## Layout

- `src/core`: models and storage logic. No UI, no platform code. Tested.
- `src/platform`: everything that differs between the Mac app and a browser tab.
- `src/ui`: the main window and the capture form.
- `src-tauri`: the wrapper: menu bar item, global shortcut, windows, permissions.
