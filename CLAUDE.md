# Daily Work app

Read `docs/PLAN.md` first: it is the current plan, with every phase, its scope and what is
built. `docs/HANDOVER.md` is the original brief it grew from. Keep `docs/PLAN.md` up to date
when a feature is built, a decision is made or scope changes.

## Decisions made (2026-11-15)

- **Stack:** a web app (React, TypeScript, Vite) in a Tauri 2 wrapper. David ruled out Swift;
  the wrapper exists for distribution through Apple. Keep product logic in TypeScript and the
  Rust in `src-tauri` to wrapper duties only (menu bar, shortcut, windows).
- **AI provider:** a company-approved provider, not yet named. Make no AI calls until it is
  named; keep sorting rule-based and put any model use behind one interface.
- **Connectors come last (David, 2026-11-16).** Build every feature against the app's own
  source-neutral records first; write the real connectors at the end.
- **Connect to anything (David, 2026-11-16).** Nothing outside a connector may name or assume
  a particular system. Gmail, Calendar, Jira and Confluence are the first systems expected,
  not the only ones. See "Connecting to other systems" below.
- **Google access:** not yet requested from the Workspace admin.
- **Atlassian:** Cloud or self-hosted is unknown. Confirm before writing that connector.

## Design

- Glass layout matched to a "Glassy Dashboard" reference clip and screenshot David shared
  (2026-11-15). He asked for glass throughout, not solid color: the sidebar, the main panel,
  the cards and the hero are all translucent over one blurred backdrop.
- Colors are RazorMetrics' (2026-11-16), sampled from a screenshot of razormetrics.com because
  the site blocks automated fetches: navy `#030069`, banner navy `#000333`, periwinkle
  `#6486f7`, lavender `#f5f7fd`, purple `#952394`, gold `#f5c24a`, body gray `#4a4a56`, and a
  magenta-to-amber gradient (`#9f3187` to about `#e2a556`) on large numerals. The earlier rose
  and coral palette is gone.
- Tokens are at the top of `src/ui/styles.css`, mirrored for Ant Design in `src/ui/theme.tsx`.
  Use `GlassCard` and `StatCard` from `src/ui/components.tsx` rather than restyling per page.
- David asked for Ant Design (`antd`) as the component library. Use it for controls: buttons,
  inputs, checkboxes, Segmented, Table, Progress, Modal, Tag, Badge, Alert, Empty. Layout,
  navigation, the glass surfaces and the bar chart are the app's own. The capture form keeps
  native `<select>`s because Ant Design's dropdowns do not fit in the small capture window.
- `lucide-react` icons and CSS-only motion. No Tailwind, Framer Motion or chart library.
- The numeral gradient ends darker than the site's amber so large numbers stay readable on white.
- Dashboard numbers come only from stored captures. Sample data exists solely for the browser
  preview (`src/platform/sampleData.ts`) and is labelled as such in the sidebar.

## Connecting to other systems

- `src/core/connectors.ts` is the whole contract. A `Connector` is an adapter for one kind of
  system: it declares the fields a user fills in and has one read-only `sync()` that returns
  plain `Activity` records and, for issue trackers, `WorkRecord`s. A `Connection` is one configured use of a connector; there can be
  several per connector. `syncAll()` runs every enabled connection independently and records
  each one's last sync time and error, so one failure never blocks the rest.
- Pages read only the neutral records (`SourceItem` in `src/core/items.ts`). A source is a
  free-text connection name and a kind is a free-text label, so a new system needs a new
  connector and nothing else. When a feature needs a new kind of record (tickets, epics,
  sprints, calendar events), add another neutral record type beside `Activity`; do not reach
  into a specific system from a page.
- Secret fields go through `SecretStore`, never the database: the Mac Keychain via the
  `secret_get/set/delete` commands in `src-tauri/src/lib.rs` (in memory on Linux test runs).
  Web requests go through the injected `HttpClient`: `tauri-plugin-http` with native TLS in
  the app (so company inspection certificates are trusted), `window.fetch` in the preview.
- Connectors live in `src/core/connectors/`, one file each, registered in
  `src/core/connectors/index.ts`. The first is `ical.ts` (any .ics calendar feed), which
  reports neutral `CalendarEventRecord`s (`src/core/calendar.ts`).
- `src/ui/useSync.ts` syncs on launch, every 15 minutes and on demand, in the main window only.
  The Connections page (`src/ui/ConnectionsPage.tsx`) adds, pauses and removes connections.
- In cloud sessions the wrapper's requests only reach hosts the sandbox allows; the npm
  registry is reachable and makes a quick "fetches but is not a calendar" check.

## Where things stand (2026-11-16)

- Phase 1 done except connectors: quick capture, the menu bar count, the team board
  (capture-based parts), and the brief and queue pages with storage and rule-based sorting.
- Phase 2 is built, except what needs connectors or AI (David chose it over Phase 3):
  the 1:1 workspace; delivery pulse, the blocker and stale-ticket sweep, and epic health on
  PM cards (on the neutral `WorkRecord` in `src/core/work.ts`); the commitment tracker
  (captures can carry a due date); the review tracker (a rule-based "Awaiting my review" list
  in the brief); the handoff window (overlap from working hours and time zones, a list of
  what to send, and a rule-built draft note that David copies and sends himself).
- The handoff window works from working hours, not calendars. A neutral calendar record
  would let it account for meetings; add one when a calendar connector is written.
- Phase 3 is built (Leadership page; logic in `src/core/leadership.ts`): shipped log, weekly
  update drafter with a user-set format, CPO 1:1 prep, priority map, roadmap vs. reality with
  plain-language slip reasons, and no-surprises alerts. Epics are linked by tracker key in
  `epic_links`. The update's default format is a guess until David shares the CPO's format.
- Phase 4 is built except the AI features (Influence page; logic in `src/core/influence.ts`):
  the narrative bank (wins plus "evidence" and "metric" captures), the stakeholder map
  (`stakeholders` table, one profile per person) and the template pre-read builder
  (`prereads` table). The exec translator and objection prep wait on the AI provider.
- All four phases are now built as far as they can go without connectors or AI. What is left
  is the connecting work, the AI features and Apple distribution; see `docs/PLAN.md`.
- The commitment tracker only knows promises David captures. Finding promises inside email
  or meeting notes needs the AI provider, so it waits for that decision.
- Epics are matched to a PM by the owner's display name. If names differ between the tracker
  and the app, add aliases to people rather than special-casing a tracker.
- A ticket deleted in the tracker stays in `work_items` until its connection is removed.
  Handle that when the first tracker connector is written.
- Only calendars can be connected so far. Nothing writes activity or tickets except the
  browser preview's sample data, so in the Mac app the brief, queue and delivery pages say
  nothing is connected.
- The sorting rules in `classify()` were written without seeing real mail. Expect to tune them
  once a connector delivers real items.
- Still open with David: the approved AI vendor, and what "distribution through Apple" means
  (App Store or notarized download).

## Working here

- `npm test` runs the unit tests; `npm run build` type-checks and bundles; `npm run e2e` runs
  the Playwright suite in `e2e/` against the browser preview (`/?empty` starts it blank).
  In cloud sessions the browser is already installed; do not run `playwright install`.
- The wrapper has no automated test. To check it on Linux: build with
  `npx tauri build --debug --no-bundle`, run `src-tauri/target/debug/daily-work` under
  `dbus-run-session -- xvfb-run`, drive it with `xdotool` (Control-Alt-Space opens capture),
  and read `~/.config/app.dailywork.desktop/dailywork.db` with `sqlite3`.
- Both windows open the database at launch. Every migration step must be safe to run twice
  and safe to run from two windows at once; `CaptureStore.open` retries for that reason.
- `npm run dev` serves the UI in a browser with an in-memory database, so it can be driven
  with Playwright. `src/platform` is the only place that knows whether Tauri is present.
- `cd src-tauri && cargo check` compiles the wrapper on Linux once the WebKitGTK dev packages
  are installed (see the Linux job in `.github/workflows/ci.yml`). macOS-only behaviour (menu
  bar title, Dock reopen, the app bundle) is only checked by the macOS CI job and on a Mac.
- SQL goes through the `Db` interface with `?` placeholders, one statement per call.
- Phase 1 is read-only against company systems. Tokens go in the macOS Keychain, never in
  files or the repo.
- Not done yet for Apple distribution: a real bundle identifier, signing, notarization, and
  the sandbox entitlements the Mac App Store requires.
