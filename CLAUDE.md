# Daily Work app

Read `docs/HANDOVER.md` first: it is the product plan, and Phase 1 is the build target.

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
  plain `Activity` records. A `Connection` is one configured use of a connector; there can be
  several per connector. `syncAll()` runs every enabled connection independently and records
  each one's last sync time and error, so one failure never blocks the rest.
- Pages read only the neutral records (`SourceItem` in `src/core/items.ts`). A source is a
  free-text connection name and a kind is a free-text label, so a new system needs a new
  connector and nothing else. When a feature needs a new kind of record (tickets, epics,
  sprints, calendar events), add another neutral record type beside `Activity`; do not reach
  into a specific system from a page.
- Secret fields go through `SecretStore` (Keychain in the Mac app; not built yet), never the
  database. Web requests go through the injected `HttpClient`.
- Not built yet: any real connector, the Keychain-backed `SecretStore`, the `HttpClient` for
  the Mac app (webview `fetch` will hit CORS; use a Tauri HTTP plugin), the screen for adding
  a connection, and the sync timer.

## Where things stand (2026-11-16)

- Phase 1 done except connectors: quick capture, the menu bar count, the team board
  (capture-based parts), and the brief and queue pages with storage and rule-based sorting.
- Nothing writes activity except the browser preview's sample data, so in the Mac app the
  brief and queue say nothing is connected.
- The sorting rules in `classify()` were written without seeing real mail. Expect to tune them
  once a connector delivers real items.
- Still open with David: the approved AI vendor, and what "distribution through Apple" means
  (App Store or notarized download).

## Working here

- `npm test` runs the storage tests; `npm run build` type-checks and bundles.
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
