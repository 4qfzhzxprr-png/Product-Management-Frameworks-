import { expect, test } from "@playwright/test";
import { capture, card, go, open } from "./helpers";

// Fixes from the usability walkthrough in docs/USABILITY.md.
test.describe("usability fixes", () => {
  test("a new install shows setup steps that lead to the right page", async ({ page }) => {
    const errors = await open(page, { empty: true });
    const setup = page.locator(".setup-strip");
    await expect(setup).toContainText("0 of 5 done");
    for (const label of ["Connect your calendar", "Import tickets", "Add your PMs", "Choose who you report to", "Try quick capture"]) {
      await expect(setup.getByRole("button", { name: new RegExp(label) })).toBeEnabled();
    }

    await setup.getByRole("button", { name: /Connect your calendar/ }).click();
    await expect(page.locator(".page-head h1")).toHaveText("Connections");
    await go(page, "Overview");
    await setup.getByRole("button", { name: /Add your PMs/ }).click();
    await expect(page.locator(".page-head h1")).toHaveText("Team");
    await go(page, "Overview");
    await setup.getByRole("button", { name: /Choose who you report to/ }).click();
    await expect(page.locator(".page-head h1")).toHaveText("Leadership");

    // A first capture ticks its step off.
    await go(page, "Overview");
    await capture(page, { text: "Send the pilot numbers", kind: "My commitment" });
    await expect(setup).toContainText("1 of 5 done");
    await expect(setup.getByRole("button", { name: /Try quick capture/ })).toBeDisabled();

    // Hidden for good once dismissed.
    await page.getByRole("button", { name: "Hide setup steps" }).click();
    await expect(setup).toHaveCount(0);
    await go(page, "Team");
    await go(page, "Overview");
    await expect(setup).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test("the sidebar is grouped, and every page is still one click away", async ({ page }) => {
    const errors = await open(page);
    const groups = page.locator(".sidebar nav").getByRole("group");
    await expect(groups).toHaveCount(4);
    await expect(page.locator(".nav-heading")).toHaveText(["Today", "Team", "Upward", "Setup"]);
    await expect(page.locator(".sidebar nav").getByRole("group", { name: "Today" }).getByRole("button")).toHaveCount(5);
    // The whole sidebar fits at the smallest normal window without scrolling.
    const nav = page.locator(".sidebar nav");
    expect(await nav.evaluate((element) => element.scrollHeight <= element.clientHeight)).toBe(true);
    expect(errors).toEqual([]);
  });

  test("the overview's waiting count matches the menu bar's: captures plus decisions", async ({ page }) => {
    const errors = await open(page);
    const captured = Number(await page.locator(".stat", { hasText: "Waiting on me" }).first().locator(".stat-value").innerText());
    const decisions = Number(await page.locator(".nav-item", { hasText: "Queue" }).locator(".nav-badge").innerText());
    const head = page.locator(".page-head p");
    await expect(head).toContainText(`${captured + decisions} items are waiting on you (${captured} captured, ${decisions}`);
    await head.getByRole("button", { name: /need your decision/ }).click();
    await expect(page.locator(".page-head h1")).toHaveText("Decision queue");
    expect(errors).toEqual([]);
  });

  test("done, clear and delete can each be undone from the toast", async ({ page }) => {
    const errors = await open(page);
    const toast = page.locator(".toast");

    // Mark a commitment done, then undo it.
    await go(page, "Commitments");
    const promised = card(page, "I promised");
    const before = await promised.locator(".item").count();
    await promised.getByRole("checkbox", { name: "Mark done: Send Marco feedback on the portal PRD" }).click();
    await expect(toast).toContainText("Done: “Send Marco feedback on the portal PRD”");
    await expect(promised.locator(".item")).toHaveCount(before - 1);
    await toast.getByRole("button", { name: "Undo" }).click();
    await expect(promised.locator(".item")).toHaveCount(before);
    await expect(toast).toHaveCount(0);

    // Clear an item from the brief, then undo with the keyboard.
    await go(page, "Brief");
    const decisions = card(page, "Needs my decision");
    await decisions.locator(".item", { hasText: "Release 4.2" }).getByRole("button", { name: "Clear" }).click();
    await expect(toast).toContainText("Cleared");
    await expect(decisions.locator(".item", { hasText: "Release 4.2" })).toHaveCount(0);
    await page.keyboard.press("ControlOrMeta+z");
    await expect(decisions.locator(".item", { hasText: "Release 4.2" })).toHaveCount(1);

    // Delete a capture, then bring it back with everything it had.
    await go(page, "Captures");
    const win = page.locator(".capture", { hasText: "Portal beta cut support tickets by a third" });
    const detail = await win.locator(".capture-detail").innerText();
    await win.getByRole("button", { name: "Delete capture" }).click();
    await expect(win).toHaveCount(0);
    await toast.getByRole("button", { name: "Undo" }).click();
    await expect(win.locator(".capture-detail")).toHaveText(detail);
    await expect(win.getByRole("button", { name: "Remove from wins" })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("handoff offers a button that opens the time zone list", async ({ page }) => {
    const errors = await open(page, { empty: true });
    await go(page, "Handoff");
    await page.getByRole("button", { name: "Choose time zone" }).click();
    await page.keyboard.type("Kolkata");
    await page.keyboard.press("Enter");
    await expect(page.getByText("Their time now")).toBeVisible();
    await expect(page.getByRole("button", { name: "Choose time zone" })).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test("a new capture is confirmed and can be taken back; Escape leaves a 1:1", async ({ page }) => {
    const errors = await open(page, { empty: true });
    await capture(page, { text: "Ship the pilot readout", kind: "My commitment" });
    const toast = page.locator(".toast");
    await expect(toast).toContainText("Captured “Ship the pilot readout” as my commitment");
    await expect(page.locator(".stat", { hasText: "Waiting on me" }).first().locator(".stat-value")).toHaveText("1");
    await toast.getByRole("button", { name: "Undo" }).click();
    await expect(page.locator(".stat", { hasText: "Waiting on me" }).first().locator(".stat-value")).toHaveText("0");

    await go(page, "Team");
    await page.getByLabel("Add a PM by name").fill("Priya");
    await page.getByLabel("Add a PM by name").press("Enter");
    await page.locator(".pm-name", { hasText: "Priya" }).click();
    await expect(page.locator(".page-head h1")).toContainText("Priya");
    await page.locator("body").click({ position: { x: 5, y: 5 } });
    await page.keyboard.press("Escape");
    await expect(page.locator(".page-head h1")).toHaveText("Team");
    expect(errors).toEqual([]);
  });
});
