import { expect, test } from "@playwright/test";
import { capture, go, open } from "./helpers";

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
});
