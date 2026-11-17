import { expect, test } from "@playwright/test";
import { card, go, open } from "./helpers";

const NOTES = `Priya 1:1
- I'll send Priya the pilot numbers by Friday.
- Priya will draft the discovery plan by Dec 3
- Can you review the consent copy tomorrow?
- We decided to pilot SMS with 20 pharmacies.
- Talked about hiring for a while.`;

test("notes from a 1:1 become follow-ups David checks before they are saved", async ({ page }) => {
  const errors = await open(page);
  await go(page, "Team");
  await page.locator(".pm-name", { hasText: "Priya" }).click();
  await page.getByRole("button", { name: "Notes into actions" }).click();

  const dialog = page.getByRole("dialog", { name: "Meeting notes into actions" });
  await expect(dialog.locator(".ant-select-content, .ant-select-selection-item").first()).toContainText("Priya");
  await dialog.getByLabel("Notes", { exact: true }).fill(NOTES);
  await dialog.getByRole("button", { name: "Find actions" }).click();

  const rows = dialog.locator(".proposal-list li");
  await expect(rows).toHaveCount(4);
  await expect(dialog).toContainText("Claude found 4.");
  await expect(rows.nth(0).getByLabel("Follow-up", { exact: true })).toHaveValue("I'll send Priya the pilot numbers by Friday");
  await expect(rows.nth(1)).toContainText("Ask of them");
  // He drops the decision and fixes the wording of his own promise.
  await rows.nth(3).getByRole("checkbox").uncheck();
  await rows.nth(0).getByLabel("Follow-up", { exact: true }).fill("Send Priya the pilot numbers");
  await dialog.getByRole("button", { name: "Add 3 to captures" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator(".toast")).toContainText("Added 3 follow-ups and the notes");

  // The notes were kept as a 1:1 note, and the follow-ups are on Priya's commitments.
  await expect(page.locator(".workspace-card", { hasText: "1:1 notes" })).toContainText("I'll send Priya the pilot numbers by Friday");
  await go(page, "Commitments");
  await expect(card(page, "I promised")).toContainText("Send Priya the pilot numbers");
  await expect(card(page, "Promised to me")).toContainText("Priya will draft the discovery plan by Dec 3");

  // Undo takes all of it back.
  await page.locator(".toast").getByRole("button", { name: "Undo" }).click();
  await expect(card(page, "I promised")).not.toContainText("Send Priya the pilot numbers");

  // What was sent is in the log.
  await go(page, "Settings");
  await expect(page.locator(".claude-log li").first()).toContainText("Meeting notes into actions");
  expect(errors).toEqual([]);
});

test("the simple rules work without Claude, from the Captures page", async ({ page }) => {
  const errors = await open(page);
  await go(page, "Captures");
  await page.getByRole("button", { name: "Notes into actions" }).click();
  const dialog = page.getByRole("dialog", { name: "Meeting notes into actions" });
  await dialog.getByLabel("Notes", { exact: true }).fill("Morgan will send the cost model next week.\nWe agreed to keep the pilot at 20 stores.");
  await dialog.getByRole("button", { name: "Without Claude" }).click();
  await expect(dialog).toContainText("The simple rules found 2.");
  await expect(dialog.getByRole("button", { name: "Add 2 to captures" })).toBeEnabled();
  await dialog.getByRole("button", { name: "Back to the notes" }).click();
  await expect(dialog.getByLabel("Notes", { exact: true })).toHaveValue(/Morgan will send/);
  expect(errors).toEqual([]);
});
