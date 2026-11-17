import { expect, test, type Page } from "@playwright/test";
import { capture, go, open } from "./helpers";

// The browser preview reads nine invented agent files and simulates runs.
async function openAgents(page: Page, empty = false) {
  const errors = await open(page, { empty });
  await go(page, "Agents");
  return errors;
}

const tab = (page: Page, name: string) => page.locator(".page-head .ant-segmented").getByText(new RegExp(`^${name}`)).click();
const detail = (page: Page) => page.locator(".run-detail");

async function runJob(page: Page, brief: string, agent?: string) {
  if (agent) {
    await page.getByLabel("Agent", { exact: true }).click();
    await page.locator(".ant-select-dropdown:visible .ant-select-item-option", { hasText: agent }).first().click();
  }
  await page.getByLabel("Brief", { exact: true }).fill(brief);
  await page.getByRole("button", { name: "Run", exact: true }).click();
}

test("the roster reads the agent files, puts the lead first and keeps changing tools off", async ({ page }) => {
  const errors = await openAgents(page);
  const cards = page.locator(".agent-card");
  await expect(cards).toHaveCount(9);
  await expect(cards.first()).toContainText("product-lead");
  await expect(cards.first()).toContainText("Lead · opus");
  await expect(page.locator(".job-form .ant-select-content, .job-form .ant-select-selection-item").first()).toContainText("product-lead (lead");

  const writer = page.locator(".agent-card", { hasText: "spec-writer" });
  await expect(writer.locator(".tool.off")).toHaveText("Create files (off)");
  await writer.getByRole("switch", { name: "Let spec-writer create files" }).click();
  await expect(writer.locator(".tool.off")).toHaveCount(0);

  // David can choose a different lead.
  await page.locator(".agent-card", { hasText: "data-analyst" }).getByRole("button", { name: "Make lead" }).click();
  await expect(cards.first()).toContainText("data-analyst");
  expect(errors).toEqual([]);
});

test("a job runs, waits for review, goes back with feedback and is approved", async ({ page }) => {
  const errors = await openAgents(page);
  await capture(page, { text: "Send pilot numbers to Morgan", kind: "My commitment" });
  await page.getByRole("checkbox", { name: "My open commitments and asks" }).check();
  await runJob(page, "Draft a PRD for pausing refill reminders\nPharmacists asked in the pilot.");

  // It opens on the run and shows progress, then the answer.
  await expect(detail(page)).toContainText("Draft a PRD for pausing refill reminders");
  await expect(detail(page).locator(".run-state")).toHaveText("Running");
  await expect(detail(page).locator(".run-steps")).toContainText("Started on preview");
  await expect(detail(page).locator(".run-state")).toHaveText("Waiting for review", { timeout: 10_000 });
  await expect(detail(page).locator(".run-output")).toContainText("Preview only: no agent ran.");
  await expect(detail(page).locator("summary")).toHaveText("Brief and my open commitments and asks");
  await expect(page.locator(".sidebar .nav-item", { hasText: "Agents" }).locator(".nav-badge")).toHaveText("1");

  // Sending back needs feedback, and starts a revision linked to the first run.
  await expect(page.getByRole("button", { name: "Send back" })).toBeDisabled();
  await page.getByLabel("Feedback").fill("Add the success metric");
  await page.getByRole("button", { name: "Send back" }).click();
  await expect(detail(page)).toContainText("Revision of the earlier run, sent back with: “Add the success metric”");
  await expect(detail(page).locator(".run-state")).toHaveText("Waiting for review", { timeout: 10_000 });

  await page.getByRole("button", { name: "Approve" }).click();
  await expect(detail(page).locator(".run-state")).toHaveText("Approved");
  await expect(page.locator(".sidebar .nav-item", { hasText: "Agents" }).locator(".nav-badge")).toHaveCount(0);
  await page.locator(".toast").getByRole("button", { name: "Undo" }).click();
  await expect(detail(page).locator(".run-state")).toHaveText("Waiting for review");
  await page.getByRole("button", { name: "Approve" }).click();

  // The agent's record counts the job as approved after one revision.
  await tab(page, "Team");
  await expect(page.locator(".agent-card", { hasText: "product-lead" })).toContainText("2 runs · 0 of 1 approved first time");
  expect(errors).toEqual([]);
});

test("a run can be stopped, run again and deleted", async ({ page }) => {
  const errors = await openAgents(page);
  await runJob(page, "Scan competitors' refill features", "market-researcher");
  await page.getByRole("button", { name: "Stop" }).click();
  await expect(detail(page).locator(".run-state")).toHaveText("Stopped");
  await page.getByRole("button", { name: "Run again" }).click();
  await expect(detail(page).locator(".run-state")).toHaveText("Waiting for review", { timeout: 10_000 });

  await page.getByRole("button", { name: "Reject" }).click();
  await expect(detail(page).locator(".run-state")).toHaveText("Rejected");
  await page.getByRole("button", { name: "Delete run" }).click();
  await page.locator(".ant-popconfirm").getByRole("button", { name: "Delete" }).click();
  await expect(page.locator(".run-row")).toHaveCount(1);
  expect(errors).toEqual([]);
});

test("schedules show when they run next and can run now, pause and be deleted", async ({ page }) => {
  const errors = await openAgents(page);
  await tab(page, "Schedules");
  await expect(page.getByText("Nothing repeats yet")).toBeVisible();
  await page.getByLabel("Schedule brief").fill("Summarize last week's shipped tickets for my Monday update");
  await page.getByRole("button", { name: "Add schedule" }).click();
  const row = page.locator(".schedule-list .item");
  await expect(row).toContainText("product-lead · Mondays at 8:00 AM · next Mon");

  await row.getByRole("button", { name: "Run now" }).click();
  await expect(detail(page)).toContainText("Summarize last week's shipped tickets");
  await expect(page.locator(".run-row").first()).toContainText("scheduled");

  await tab(page, "Schedules");
  await row.getByRole("switch", { name: "Pause schedule" }).click();
  await expect(row).toContainText("· paused");
  await row.getByRole("button", { name: "Delete schedule" }).click();
  await page.locator(".ant-popconfirm").getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText("Nothing repeats yet")).toBeVisible();
  expect(errors).toEqual([]);
});

test("with no agent files, the page says where it looked and leads to settings", async ({ page }) => {
  const errors = await openAgents(page, true);
  await expect(page.getByText("No agents found")).toBeVisible();
  await expect(page.getByText("There are no agent files in ~/.claude/agents.")).toBeVisible();
  await page.getByRole("button", { name: "Choose the agent folder" }).click();
  await expect(page.locator("#agent-settings")).toBeVisible();
  await expect(page.getByText("Agents can only read until you say otherwise")).toBeVisible();
  await page.getByLabel("Agent folder").fill("~/work/product/.claude/agents");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.locator(".toast")).toContainText("Agent settings saved");
  await tab(page, "Team");
  await expect(page.getByText("There are no agent files in ~/work/product/.claude/agents.")).toBeVisible();
  expect(errors).toEqual([]);
});

test("agents can read a copy of the app's data, which David can see and switch off", async ({ page }) => {
  const errors = await openAgents(page);
  await tab(page, "Settings");
  await page.getByRole("button", { name: "See what they can read" }).click();
  const viewer = page.getByRole("dialog", { name: "What agents can read" });
  await expect(viewer.locator(".snapshot-view")).toContainText("David's Daily Work app: read-only data");
  await viewer.getByText("commitments.md", { exact: true }).click();
  await expect(viewer.locator(".snapshot-view")).toContainText("Confirm the Q1 roadmap themes with the CPO");
  await page.keyboard.press("Escape");

  // A run by an agent that can read files is told where the copy is.
  await tab(page, "Team");
  await runJob(page, "What did I promise Jordan?");
  await expect(detail(page).locator(".run-state")).toHaveText("Waiting for review", { timeout: 10_000 });
  await go(page, "Settings");
  const entry = page.locator(".claude-log li").first();
  await entry.getByRole("button").first().click();
  await expect(entry.locator(".log-detail")).toContainText("A read-only copy is in");

  // Switched off, the next run is not.
  await go(page, "Agents");
  await tab(page, "Settings");
  await page.getByRole("switch", { name: "Let agents read the app's data" }).click();
  await expect(page.locator(".toast")).toContainText("Agents no longer get the app's data");
  await tab(page, "Team");
  await runJob(page, "Another question");
  await expect(detail(page).locator(".run-state")).toHaveText("Waiting for review", { timeout: 10_000 });
  await go(page, "Settings");
  const latest = page.locator(".claude-log li").first();
  await latest.getByRole("button").first().click();
  await expect(latest.locator(".log-detail")).not.toContainText("A read-only copy is in");
  expect(errors).toEqual([]);
});
