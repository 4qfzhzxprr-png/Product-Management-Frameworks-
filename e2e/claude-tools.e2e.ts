import { expect, test } from "@playwright/test";
import { go, open } from "./helpers";

test("Claude translates for an executive and checks a spec, and each send is logged", async ({ page }) => {
  const errors = await open(page);
  await go(page, "Influence");
  await page.locator(".page-head .ant-segmented").getByText("With Claude", { exact: true }).click();
  await expect(page.locator(".tools-grid .ant-select-content, .tools-grid .ant-select-selection-item").first()).toContainText("Jordan, CPO");
  await page.getByLabel("Text for Claude").fill("The refill pilot is 25% done with 73% of the time gone.");
  await page.getByRole("button", { name: "Translate" }).click();
  await expect(page.locator(".tools-grid .run-output")).toContainText("Preview only: Claude was not asked.");

  await page.locator(".tools-grid .ant-segmented").getByText("Check a spec", { exact: true }).click();
  await expect(page.getByLabel("Audience")).toHaveCount(0);
  await page.getByLabel("Text for Claude").fill("PRD: pause refill reminders. Problem: pharmacists asked for it.");
  await page.getByRole("button", { name: "Check the spec" }).click();
  await expect(page.locator(".tools-grid .run-output")).toContainText("spec-check");

  await go(page, "Settings");
  await expect(page.locator(".claude-log li").first()).toContainText("Spec check");
  await expect(page.locator(".claude-log li").nth(1)).toContainText("Exec translator");
  expect(errors).toEqual([]);
});

test("a pre-read's empty sections are drafted, and likely objections listed", async ({ page }) => {
  const errors = await open(page);
  await go(page, "Influence");
  await page.locator(".page-head .ant-segmented").getByText("Pre-reads", { exact: true }).click();
  await page.getByLabel("Background", { exact: true }).fill("");
  await page.getByRole("button", { name: "Draft empty sections" }).click();
  await expect(page.getByLabel("Background", { exact: true })).toHaveValue("Preview: Claude would draft the background section here.");
  await expect(page.getByText("Not saved yet")).toBeVisible();
  // Sections that already had text are left alone.
  await expect(page.getByLabel("Recommendation", { exact: true })).toHaveValue(/^Expand now/);

  await page.getByRole("button", { name: "Likely objections" }).click();
  await expect(page.locator(".pm-section", { hasText: "Likely objections" }).locator(".run-output")).toContainText("objection-prep");
  expect(errors).toEqual([]);
});
