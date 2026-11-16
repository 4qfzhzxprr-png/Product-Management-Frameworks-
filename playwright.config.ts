import { defineConfig } from "@playwright/test";

// End-to-end tests drive the UI in a browser against the in-memory preview database.
// They cover everything except what only the Mac wrapper does (menu bar, global shortcut,
// saving to disk).
export default defineConfig({
  testDir: "e2e",
  testMatch: "*.e2e.ts",
  fullyParallel: true,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:1423",
    viewport: { width: 1240, height: 860 },
    timezoneId: "America/Chicago",
    trace: "off",
  },
  webServer: {
    command: "npx vite --port 1423 --strictPort",
    url: "http://localhost:1423",
    reuseExistingServer: true,
  },
});
