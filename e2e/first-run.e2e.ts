import { expect, test } from "@playwright/test";
import { capture, card, dateFromToday, go, open, stat } from "./helpers";

// A new install: nothing captured, nothing connected.
test.describe("first run, with nothing stored", () => {
  test("every page explains its empty state", async ({ page }) => {
    const errors = await open(page, { empty: true });

    await expect(page.locator(".hero h2")).toHaveText("You're all clear");
    await expect(page.locator(".ring-text strong")).toHaveText("100%");
    for (const label of ["Waiting on me", "Waiting on others", "Wins", "Captured this week"]) {
      await expect(stat(page, label)).toHaveText("0");
    }
    await expect(page.locator(".nav-badge")).toHaveCount(0);

    await go(page, "Brief");
    await expect(page.getByText("Nothing synced yet")).toBeVisible();
    await go(page, "Queue");
    await expect(page.getByText("Nothing synced yet")).toBeVisible();
    await go(page, "Team");
    await expect(page.getByText("No PMs yet")).toBeVisible();
    await go(page, "Commitments");
    await expect(page.getByText("You have no open commitments.")).toBeVisible();
    await expect(page.getByText("Nobody owes you anything.")).toBeVisible();
    await go(page, "Delivery");
    await expect(page.getByText("No tickets synced yet")).toBeVisible();
    await go(page, "Handoff");
    await expect(page.getByText("Choose the offshore team's time zone")).toBeVisible();
    await expect(page.getByText("No issue tracker is connected yet")).toBeVisible();
    await go(page, "Analytics");
    await expect(page.getByText("No captures in the last 30 days.")).toBeVisible();
    await go(page, "Captures");
    await expect(page.getByText("Nothing here yet.")).toBeVisible();

    expect(errors).toEqual([]);
  });

  test("a commitment flows through capture, overview, commitments, captures and analytics", async ({ page }) => {
    const errors = await open(page, { empty: true });

    // People and projects first, so the capture can be filed against them.
    await go(page, "Captures");
    await page.getByLabel("Add person").fill("Priya");
    await page.getByLabel("Add person").press("Enter");
    await page.getByLabel("Add project").fill("Portal");
    await page.getByLabel("Add project").press("Enter");
    await expect(page.locator(".filters")).toContainText("Priya");
    await expect(page.locator(".filters")).toContainText("Portal");

    await capture(page, {
      text: "Send Priya the roadmap draft",
      kind: "My commitment",
      person: "Priya",
      project: "Portal",
      due: await dateFromToday(page, -2),
    });
    const row = page.locator(".capture", { hasText: "Send Priya the roadmap draft" });
    await expect(row).toContainText("My commitment · Priya · Portal");

    // It counts as waiting on me everywhere.
    await expect(page.locator(".nav-item", { hasText: "Captures" }).locator(".nav-badge")).toHaveText("1");
    await go(page, "Overview");
    await expect(stat(page, "Waiting on me")).toHaveText("1");
    await expect(stat(page, "Captured this week")).toHaveText("1");
    await expect(page.locator(".hero h2")).toContainText("1 capture is still waiting on you");
    await expect(page.locator(".ring-text strong")).toHaveText("0%");
    await expect(card(page, "Waiting on you")).toContainText("Send Priya the roadmap draft");

    // It is two days late.
    await go(page, "Commitments");
    await expect(page.locator(".page-head")).toContainText("1 promise has slipped");
    await expect(card(page, "I promised")).toContainText("Slipped 2 days");
    await go(page, "Handoff");
    await expect(card(page, "Before you sign off")).toContainText("Send Priya the roadmap draft");
    await expect(page.getByRole("textbox", { name: "Draft handoff note" })).toHaveValue(
      /- Send Priya the roadmap draft: \[update\]/,
    );

    await go(page, "Analytics");
    await expect(stat(page, "Captured")).toHaveText("1");
    await expect(stat(page, "Still open")).toHaveText("1");
    await expect(page.locator(".column .bar")).toHaveCount(30);

    // Done from the overview: every count drops.
    await go(page, "Overview");
    await card(page, "Waiting on you").getByRole("checkbox").click();
    await expect(stat(page, "Waiting on me")).toHaveText("0");
    await expect(page.locator(".ring-text strong")).toHaveText("100%");
    await expect(page.locator(".hero h2")).toHaveText("Everything is cleared");
    await expect(page.locator(".nav-badge")).toHaveCount(0);
    await go(page, "Commitments");
    await expect(page.getByText("You have no open commitments.")).toBeVisible();
    await go(page, "Analytics");
    await expect(stat(page, "Closed")).toHaveText("1");
    await expect(stat(page, "Still open")).toHaveText("0");

    // In Captures it shows as done, and can be reopened.
    await go(page, "Captures");
    await expect(row).toHaveClass(/done/);
    await row.getByRole("checkbox").click();
    await expect(row).not.toHaveClass(/done/);

    expect(errors).toEqual([]);
  });

  test("captures can be edited, starred, searched, filtered and deleted", async ({ page }) => {
    const errors = await open(page, { empty: true });
    await go(page, "Captures");
    await page.getByLabel("Add person").fill("Marco");
    await page.getByLabel("Add person").press("Enter");
    await capture(page, { text: "Portal beta cut tickets by a third", win: true });
    await capture(page, { text: "Ask Marco for the estimate", kind: "Ask of them", person: "Marco" });
    await capture(page, { text: "Pricing page idea", kind: "Thought" });
    await expect(page.locator(".capture")).toHaveCount(3);

    // Filters.
    await page.locator(".filter-item", { hasText: "Wins" }).click();
    await expect(page.locator(".capture")).toHaveCount(1);
    await page.locator(".filter-item", { hasText: "Open" }).click();
    await expect(page.locator(".capture")).toHaveText([/Ask Marco for the estimate/]);
    await page.locator(".filter-item", { hasText: "Marco" }).click();
    await expect(page.locator(".capture")).toHaveCount(1);
    await page.locator(".filter-item", { hasText: "All" }).click();

    // Search.
    await page.getByLabel("Search captures").fill("PRICING");
    await expect(page.locator(".capture")).toHaveText([/Pricing page idea/]);
    await page.getByLabel("Search captures").fill("nothing matches this");
    await expect(page.getByText("No matches")).toBeVisible();
    await page.getByLabel("Search captures").fill("");

    // Edit.
    const idea = page.locator(".capture", { hasText: "Pricing page idea" });
    await idea.getByRole("button", { name: "Edit capture" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByLabel("Capture text")).toHaveValue("Pricing page idea");
    await dialog.getByLabel("Capture text").fill("Pricing page experiment");
    await dialog.getByLabel("Kind").selectOption({ label: "My commitment" });
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(page.locator(".capture", { hasText: "Pricing page experiment" })).toContainText("My commitment");
    await expect(page.locator(".capture")).toHaveCount(3);

    // Star and unstar.
    const edited = page.locator(".capture", { hasText: "Pricing page experiment" });
    await edited.getByRole("button", { name: "Mark as a win" }).click();
    await page.locator(".filter-item", { hasText: "Wins" }).click();
    await expect(page.locator(".capture")).toHaveCount(2);
    await page.locator(".filter-item", { hasText: "All" }).click();

    // Delete, and remove a person without losing their captures.
    await edited.getByRole("button", { name: "Delete capture" }).click();
    await expect(page.locator(".capture")).toHaveCount(2);
    await page.getByRole("button", { name: "Remove Marco" }).click();
    await expect(page.locator(".filters")).not.toContainText("Marco");
    await expect(page.locator(".capture", { hasText: "Ask Marco for the estimate" })).toBeVisible();

    expect(errors).toEqual([]);
  });

  test("the capture dialog saves on Return, cancels on Escape and refuses empty text", async ({ page }) => {
    await open(page, { empty: true });
    await page.locator(".capture-button").click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByLabel("Capture text")).toBeFocused();
    await expect(dialog.getByRole("button", { name: "Save" })).toBeDisabled();
    await dialog.getByLabel("Capture text").fill("   ");
    await expect(dialog.getByRole("button", { name: "Save" })).toBeDisabled();
    // A date only applies to promises.
    await expect(dialog.locator(".due")).toHaveCount(0);
    await dialog.getByLabel("Kind").selectOption({ label: "My commitment" });
    await expect(dialog.locator(".due")).toHaveCount(1);

    await dialog.getByLabel("Capture text").fill("Thrown away");
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(stat(page, "Captured this week")).toHaveText("0");

    await page.locator(".capture-button").click();
    await dialog.getByLabel("Capture text").fill("Kept");
    await dialog.getByLabel("Capture text").press("Enter");
    await expect(dialog).toBeHidden();
    await expect(stat(page, "Captured this week")).toHaveText("1");
  });

  test("a PM gets a card and a 1:1 workspace with a carrying agenda", async ({ page }) => {
    const errors = await open(page, { empty: true });
    await go(page, "Team");
    await page.getByLabel("Add a PM by name").fill("Priya");
    await page.getByLabel("Add a PM by name").press("Enter");
    const pm = page.locator(".pm-card", { hasText: "Priya" });
    await expect(pm).toContainText("Nothing captured yet");
    await expect(pm).toContainText("No issue tracker is connected yet");

    // From the card: an ask, already set to this person.
    await pm.getByRole("button", { name: "Ask", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByLabel("Kind")).toHaveValue("ask_of_them");
    await expect(dialog.getByLabel("Person", { exact: true }).locator("option:checked")).toHaveText("Priya");
    await dialog.getByLabel("Capture text").fill("Recruiting plan for usability tests");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(pm.locator(".pm-section", { hasText: "I'm waiting on" })).toContainText("Recruiting plan");

    // The workspace.
    await pm.getByRole("button", { name: /1:1 workspace/ }).click();
    await expect(page.locator(".page-head h1")).toHaveText("1:1 with Priya");
    await page.getByLabel("Add a topic").fill("Promotion case");
    await page.getByLabel("Add a topic").press("Enter");
    await page.getByLabel("Add a topic").fill("Discovery scope");
    await page.getByLabel("Add a topic").press("Enter");
    await page.getByLabel("Something I promised").fill("Intro to the CPO");
    await page.getByLabel("Something I promised").press("Enter");
    await expect(card(page, "Agenda").locator(".workspace-list li")).toHaveCount(2);
    await expect(card(page, "Commitments")).toContainText("Intro to the CPO");
    await expect(card(page, "Commitments")).toContainText("Recruiting plan");

    // Discussing a topic removes it; the note is kept.
    await card(page, "Agenda").getByRole("checkbox", { name: /Promotion case/ }).click();
    await expect(card(page, "Agenda").locator(".workspace-list li")).toHaveText([/Discovery scope/]);
    await page.getByRole("textbox", { name: "Notes from this 1:1" }).fill("Agreed the readout goes Thursday.");
    await page.getByRole("button", { name: "Save note" }).click();
    await expect(card(page, "1:1 notes").locator(".notes li")).toHaveCount(1);
    await expect(page.locator(".page-head")).toContainText("Last 1:1 note today · 1 on the agenda");
    // Nothing is flagged as carried over on the day of the 1:1 itself.
    await expect(card(page, "Agenda")).not.toContainText("Carried over");

    // Back on the board the card reflects it, and the promise counts as waiting on me.
    await page.getByRole("button", { name: "Team" }).first().click();
    await expect(pm.locator(".pm-section", { hasText: "Needs from me" })).toContainText("Intro to the CPO");
    await expect(pm.locator(".pm-section", { hasText: "Last 1:1" })).toContainText("Agreed the readout goes Thursday.");
    await go(page, "Overview");
    await expect(stat(page, "Waiting on me")).toHaveText("1");
    await expect(stat(page, "Waiting on others")).toHaveText("1");

    expect(errors).toEqual([]);
  });
});
