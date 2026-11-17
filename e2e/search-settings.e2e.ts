import { expect, test } from "@playwright/test";
import { go, open } from "./helpers";

test("Command-K finds people, pages and captures and goes straight to them", async ({ page }) => {
  const errors = await open(page);
  const palette = page.getByRole("combobox", { name: "Search everything" });

  await page.keyboard.press("ControlOrMeta+k");
  await palette.fill("priya s");
  await expect(page.locator(".palette-results li").first()).toContainText("Priya");
  await page.keyboard.press("Enter");
  await expect(page.locator(".page-head h1")).toHaveText("1:1 with Priya");

  // From the sidebar button too, and to a page by name.
  await page.getByRole("button", { name: "Search everything" }).click();
  await palette.fill("deliv");
  await page.keyboard.press("Enter");
  await expect(page.locator(".page-head h1")).toHaveText("Delivery");

  // Arrow keys move through the results; a capture opens for editing.
  await page.keyboard.press("ControlOrMeta+k");
  await palette.fill("pricing");
  await expect(page.locator(".palette-results li.active .palette-group")).toHaveText("Capture");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: "Edit capture" })).toBeVisible();
  await page.keyboard.press("Escape");

  await page.keyboard.press("ControlOrMeta+k");
  await palette.fill("zzzz nothing");
  await expect(page.locator(".palette-results")).toContainText("Nothing matches “zzzz nothing”.");
  await page.keyboard.press("Escape");
  await expect(palette).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("Settings gathers reminders, handoff hours, agents, backups and the Claude log", async ({ page }) => {
  const errors = await open(page);
  await go(page, "Settings");
  for (const heading of ["Reminders", "Handoff hours", "Agents", "Set where it is used", "Backups", "Sent to Claude"]) {
    await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
  }
  // Handoff hours set here show on the Handoff page.
  await page.locator("#settings-handoff").getByRole("textbox", { name: "Offshore team name in the tracker" }).fill("Pune");
  await go(page, "Handoff");
  await expect(page.getByRole("textbox", { name: "Offshore team name in the tracker" })).toHaveValue("Pune");
  await go(page, "Settings");
  await page.locator(".settings-jump").getByRole("button", { name: "Set where it is used" }).click();
  await page.locator("#settings-elsewhere").getByRole("button", { name: "Leadership" }).click();
  await expect(page.locator(".page-head h1")).toHaveText("Leadership");
  expect(errors).toEqual([]);
});
