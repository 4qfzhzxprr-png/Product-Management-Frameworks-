# Daily Work app

Read `docs/HANDOVER.md` first: it is the product plan, and Phase 1 is the build target.

## Decisions made (2026-11-15)

- **Stack:** a web app (React, TypeScript, Vite) in a Tauri 2 wrapper. David ruled out Swift;
  the wrapper exists for distribution through Apple. Keep product logic in TypeScript and the
  Rust in `src-tauri` to wrapper duties only (menu bar, shortcut, windows).
- **AI provider:** a company-approved provider, not yet named. Make no AI calls until it is
  named; keep sorting rule-based and put any model use behind one interface.
- **Google access:** not yet requested from the Workspace admin. Build that connector last.
- **Atlassian:** Cloud or self-hosted is unknown. Confirm before building the connector.

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

## Where Phase 1 stands (2026-11-16)

- Done: quick capture, the menu bar count, the team board (capture-based parts), and the
  brief and queue pages with their storage and rule-based sorting.
- Not done: every connector. Nothing writes to the `items` table except the browser preview's
  sample data. A connector's whole job is to call `store.items.upsert()` with `IncomingItem`s
  (see `src/core/items.ts`); the brief, the queue and the menu bar count then work unchanged.
- The sorting rules in `classify()` were written without seeing real mail. Expect to tune them
  once a connector delivers real items.
- Blocked on David: whether Atlassian is Cloud and allows API tokens, Google OAuth approval,
  the approved AI vendor, and what "distribution through Apple" means (App Store or notarized
  download).

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
