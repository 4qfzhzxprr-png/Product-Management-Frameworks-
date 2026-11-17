import { expect, test, type Page } from "@playwright/test";
import { go, open } from "./helpers";

const tab = (page: Page, name: string) => page.locator(".page-head .ant-segmented").getByText(new RegExp(`^${name}`)).click();

test("a brief can be saved and started again in one choice", async ({ page }) => {
  const errors = await open(page);
  await go(page, "Agents");
  await page.getByLabel("Brief", { exact: true }).fill("Monday competitor scan\nPricing and refill features at the top five rivals.");
  await page.getByRole("checkbox", { name: "Wins, evidence and metrics (90 days)" }).check();
  await page.getByRole("button", { name: "Save as a brief" }).click();
  await expect(page.getByLabel("Name for the saved brief")).toHaveValue("Monday competitor scan");
  await page.getByLabel("Name for the saved brief").press("Enter");
  await expect(page.locator(".toast")).toContainText("Saved the brief “Monday competitor scan”");

  await page.getByLabel("Brief", { exact: true }).fill("");
  await page.getByRole("checkbox", { name: "Wins, evidence and metrics (90 days)" }).uncheck();
  await page.getByLabel("Saved brief").click();
  await page.locator(".ant-select-dropdown:visible .ant-select-item-option", { hasText: "Monday competitor scan" }).click();
  await expect(page.getByLabel("Brief", { exact: true })).toHaveValue(/^Monday competitor scan\nPricing/);
  await expect(page.getByRole("checkbox", { name: "Wins, evidence and metrics (90 days)" })).toBeChecked();
  expect(errors).toEqual([]);
});

test("approved work becomes a pre-read or a file, shows in the weekly review and the report", async ({ page }) => {
  const errors = await open(page);
  await go(page, "Agents");
  await page.getByLabel("Brief", { exact: true }).fill("Refill pause PRD");
  await page.getByRole("button", { name: "Run", exact: true }).click();
  const detail = page.locator(".run-detail");
  await expect(detail.locator(".run-state")).toHaveText("Waiting for review", { timeout: 10_000 });
  await expect(detail.getByRole("button", { name: "Make a pre-read" })).toHaveCount(0);
  await page.getByRole("button", { name: "Approve" }).click();

  const download = page.waitForEvent("download");
  await detail.getByRole("button", { name: "Save as a file" }).click();
  expect((await download).suggestedFilename()).toMatch(/^\d{4}-\d{2}-\d{2}-refill-pause-prd\.md$/);

  await detail.getByRole("button", { name: "Make a pre-read" }).click();
  await expect(page.locator(".toast")).toContainText("Started a pre-read from “Refill pause PRD” under Influence");

  await tab(page, "Report");
  const row = page.locator(".chart-table tbody tr", { hasText: "product-lead" });
  await expect(row).toContainText("1 of 1 (100%)");

  // Early in the week the review covers last week, so today's work only shows later in the week.
  await go(page, "Weekly review");
  const thisWeek = (await page.locator(".page-head p").innerText()).startsWith("This week");
  if (thisWeek) await expect(page.locator(".glass", { hasText: "Agent work approved" })).toContainText("Refill pause PRD");
  else await expect(page.locator(".glass", { hasText: "Agent work approved" })).toHaveCount(0);

  await go(page, "Influence");
  await page.locator(".page-head .ant-segmented").getByText("Pre-reads", { exact: true }).click();
  await expect(page.locator(".prereads-list, .glass").filter({ hasText: "Refill pause PRD" }).first()).toBeVisible();
  expect(errors).toEqual([]);
});
