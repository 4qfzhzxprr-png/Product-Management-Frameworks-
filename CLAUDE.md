# Daily Work app

Read `docs/HANDOVER.md` first: it is the product plan, and Phase 1 is the build target.

## Decisions made (2026-11-15)

- **Stack:** native SwiftUI, built as a Swift package (`Package.swift`), macOS 13+. No Xcode
  project is checked in; `scripts/build-app.sh` assembles the `.app`.
- **AI provider:** a company-approved provider, not yet named. Make no AI calls until it is
  named; keep sorting rule-based and put any model use behind one protocol.
- **Google access:** not yet requested from the Workspace admin. Build that connector last.
- **Atlassian:** Cloud or self-hosted is unknown. Confirm before building the connector.

## Working here

- Cloud sessions run on Linux with no Swift toolchain, so code cannot be compiled locally.
  The GitHub Actions workflow (macOS) is the only build and test check: push, then read the run.
- Keep logic that can be tested without UI in `DailyWorkCore`, with tests.
- Phase 1 is read-only against company systems. Tokens go in the macOS Keychain, never in
  files or the repo.
