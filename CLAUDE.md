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

- Warm rose glass look, taken from a short "Glassy Dashboard" reference clip David shared
  (2026-11-15). Tokens are at the top of `src/ui/styles.css`; use `GlassCard` and `StatCard`
  from `src/ui/components.tsx` rather than restyling per page.
- Plain CSS, `lucide-react` icons, CSS-only motion, and a hand-built bar chart. No Tailwind,
  Framer Motion or chart library.
- Text and accent colors are darker than the clip's pastels so small text keeps 4.5:1 contrast.
- Dashboard numbers come only from stored captures. Sample data exists solely for the browser
  preview (`src/platform/sampleData.ts`) and is labelled as such in the sidebar.

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
