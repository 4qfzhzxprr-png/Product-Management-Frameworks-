import { expect, test } from "@playwright/test";
import { go, open } from "./helpers";

test("the weekly review looks back, keeps next week's priorities and saves as a note", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const errors = await open(page);
  await go(page, "Weekly review");
  await expect(page.locator(".page-head h1")).toHaveText("Weekly review");
  await expect(page.locator(".glass", { hasText: "Slipped" })).toContainText("Confirm the Q1 roadmap themes with the CPO");
  await expect(page.locator(".glass", { hasText: "Slipped" })).toContainText("promised to leadership");

  await page.getByLabel("Priority 1").fill("Ship the refill pilot readout");
  await page.getByLabel("Priority 2").fill("Close the offshore lead hire");
  await page.getByLabel("Notes for yourself").click();
  await go(page, "Overview");
  await go(page, "Weekly review");
  await expect(page.getByLabel("Priority 1")).toHaveValue("Ship the refill pilot readout");

  await page.getByRole("button", { name: "Copy" }).click();
  const text = await page.evaluate(() => navigator.clipboard.readText());
  expect(text).toMatch(/^Weekly review, /);
  expect(text).toContain("Next week's priorities\n1. Ship the refill pilot readout\n2. Close the offshore lead hire");

  await page.getByRole("button", { name: "Save as a note" }).click();
  await expect(page.locator(".toast")).toContainText("Saved the review as a note");
  await go(page, "Captures");
  await expect(page.locator(".capture-body").first()).toContainText("Weekly review, ");
  expect(errors).toEqual([]);
});

test("reminders are listed under Settings and can be switched off", async ({ page }) => {
  const errors = await open(page);
  await page.waitForTimeout(800);
  await go(page, "Settings");
  const card = page.locator(".glass", { hasText: "Recent reminders" });
  await expect(card).toContainText("A promise has slipped");
  await expect(card).toContainText("Confirm the Q1 roadmap themes with the CPO was due 2 days ago.");
  await expect(card).toContainText("not shown as a notification");
  await page.getByRole("switch", { name: "Reminders on" }).click();
  await expect(page.getByRole("switch", { name: "Morning summary" })).toBeDisabled();
  await page.getByRole("button", { name: "Send a test notification" }).click();
  await expect(page.locator(".toast")).toContainText("The browser preview cannot show notifications");
  expect(errors).toEqual([]);
});
