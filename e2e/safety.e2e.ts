import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { go, open } from "./helpers";

test("a brief with patient details is held back until David chooses, and the log shows what went", async ({ page }) => {
  const errors = await open(page);
  await go(page, "Agents");
  await page.getByLabel("Brief", { exact: true }).fill("Summarize the complaint from SSN 123-45-6789 about refill reminders");
  await page.getByRole("button", { name: "Run", exact: true }).click();

  const warning = page.getByRole("dialog");
  await expect(warning).toContainText("This may contain patient or customer details");
  await expect(warning).toContainText("Social Security number: 12•••••••89");
  await expect(warning).not.toContainText("45-6789");
  await warning.getByRole("button", { name: "Don't send" }).click();
  await expect(warning).toBeHidden();
  await page.locator(".page-head .ant-segmented").getByText("Runs", { exact: true }).click();
  await expect(page.getByText("No runs yet")).toBeVisible();

  await page.locator(".page-head .ant-segmented").getByText("Team", { exact: true }).click();
  await page.getByLabel("Brief", { exact: true }).fill("Summarize the complaint from SSN 123-45-6789 about refill reminders");
  await page.getByRole("button", { name: "Run", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Send anyway" }).click();
  await expect(page.locator(".run-detail .run-state")).toHaveText("Waiting for review", { timeout: 10_000 });

  await go(page, "Settings");
  const entry = page.locator(".claude-log li").first();
  await expect(entry).toContainText("Agent run: product-lead");
  await expect(entry).toContainText("Sent despite warning");
  await entry.getByRole("button").first().click();
  await expect(entry.locator(".log-detail")).toContainText("Summarize the complaint from SSN 123-45-6789");
  await expect(entry.locator(".log-detail")).toContainText("Flagged: Social Security number");
  expect(errors).toEqual([]);
});

test("everything can be exported as one readable file", async ({ page }) => {
  const errors = await open(page);
  await go(page, "Settings");
  await expect(page.getByText("The browser preview saves nothing")).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export everything" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^dailywork-export-\d{4}-\d{2}-\d{2}-\d{4}\.json$/);
  const exported = JSON.parse(readFileSync(await file.path(), "utf8"));
  expect(exported.app).toBe("Daily Work");
  expect(exported.tables.captures.length).toBeGreaterThan(10);
  await expect(page.locator(".toast")).toContainText("Exported to your Downloads folder");
  expect(errors).toEqual([]);
});
