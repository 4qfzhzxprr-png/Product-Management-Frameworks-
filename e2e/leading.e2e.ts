import { expect, test } from "@playwright/test";
import { dateFromToday, go, open } from "./helpers";

test("a new PM is flagged until there is a 1:1 and some praise", async ({ page }) => {
  const errors = await open(page, { empty: true });
  await go(page, "Team");
  await page.getByLabel("Add a PM by name").fill("Sam");
  await page.getByLabel("Add a PM by name").press("Enter");
  await expect(page.locator(".slip-banner")).toContainText("One PM has had no 1:1 in over two weeks, and none is booked: Sam (never)");
  const card = page.locator(".pm-card", { hasText: "Sam" });
  await expect(card.locator(".nudge")).toHaveText(["No 1:1 notes yet", "No praise or wins recorded yet"]);

  await card.locator(".pm-name").click();
  await page.getByLabel("Notes from this 1:1").fill("Talked through the discovery plan.");
  await page.getByRole("button", { name: "Save note" }).click();
  await page.getByLabel("Feedback to remember").fill("Great framing of the pricing trade-offs");
  await page.getByLabel("Feedback to remember").press("Enter");
  await page.getByRole("button", { name: "Mark as praise: Great framing of the pricing trade-offs" }).click();
  await expect(page.locator(".workspace-card", { hasText: "Feedback and praise" })).toContainText("Praise");

  await page.keyboard.press("Escape");
  await expect(page.locator(".slip-banner")).toHaveCount(0);
  await expect(page.locator(".pm-card", { hasText: "Sam" }).locator(".nudge")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("review prep gathers the evidence and Claude drafts from it", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const errors = await open(page);
  await go(page, "Team");
  await page.locator(".pm-name", { hasText: "Priya" }).click();
  await page.getByRole("button", { name: "Review prep" }).click();
  const dialog = page.getByRole("dialog", { name: "Review prep: Priya" });
  await expect(dialog.locator(".review-packet")).toContainText("Wins and praise");
  await expect(dialog.locator(".review-packet")).toContainText("Portal beta cut support tickets by a third");
  await dialog.getByText("12 months", { exact: true }).click();
  await dialog.getByRole("button", { name: "Copy the evidence" }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/^Priya: /);
  await dialog.getByRole("button", { name: "Draft the review with Claude" }).click();
  await expect(dialog).toContainText("First draft from Claude");
  await expect(dialog.getByRole("button", { name: "Copy the draft" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("time off is recorded on Team and shows on Delivery for the sprint", async ({ page }) => {
  const errors = await open(page);
  await go(page, "Team");
  const card = page.locator(".time-off");
  await card.getByLabel("Who is off").click();
  await page.locator(".ant-select-dropdown:visible .ant-select-item-option", { hasText: "Priya" }).click();
  await card.getByLabel("From").fill(await dateFromToday(page, 2));
  await card.getByLabel("To").fill(await dateFromToday(page, 3));
  await card.getByLabel("Note").fill("Conference");
  await card.getByRole("button", { name: "Add" }).click();
  await expect(card.locator(".review-list")).toContainText("Priya: ");
  await expect(card.locator(".review-list")).toContainText("· Conference");

  await go(page, "Delivery");
  await expect(page.locator(".time-off-banner")).toContainText("Out before the sprint ends: Priya: ");
  await expect(page.locator(".time-off-banner")).toContainText("Conference");
  expect(errors).toEqual([]);
});
