import { expect, test } from "@playwright/test";
import { card, go, open } from "./helpers";

async function tab(page: import("@playwright/test").Page, name: string) {
  await page.locator(".page-head .ant-segmented").getByText(name, { exact: true }).click();
}

test.describe("leadership, with sample data", () => {
  test("slipping commitments surface on the overview, the nav and the page", async ({ page }) => {
    const errors = await open(page);
    const banner = page.locator(".slip-banner");
    await expect(banner).toContainText("2 commitments to leadership are slipping.");
    await expect(page.locator(".nav-item", { hasText: "Leadership" }).locator(".nav-badge")).toHaveText("2");
    await banner.getByRole("button", { name: "Review" }).click();
    await expect(page.locator(".page-head h1")).toHaveText("Leadership");

    const alerts = page.locator(".alerts .item");
    await expect(alerts).toHaveCount(2);
    // Late first.
    await expect(alerts.nth(0)).toContainText("Late");
    await expect(alerts.nth(0)).toContainText("Eligibility checks for the top payers");
    await expect(alerts.nth(0)).toContainText("Past the date given to leadership");
    await expect(alerts.nth(1)).toContainText("At risk");
    await expect(alerts.nth(1)).toContainText("Scope grew from 2 to 4 tickets");
    expect(errors).toEqual([]);
  });

  test("the weekly update is drafted from stored data and follows the chosen format", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    const errors = await open(page);
    await go(page, "Leadership");
    const draft = page.getByRole("textbox", { name: "Draft weekly update" });
    await expect(draft).toHaveValue(/^Product update, week of /);
    await expect(draft).toHaveValue(/Shipped\n- Patient portal beta: Consent screen/);
    await expect(draft).toHaveValue(/Decisions\n- Pilot SMS reminders with 20 pharmacies/);
    await expect(draft).toHaveValue(/What I need from you\n- Q1 headcount approval for the offshore team/);
    await expect(draft).toHaveValue(/- 2 tickets are blocked or waiting on a product answer\./);

    // Rename, switch off and reorder sections.
    await page.getByRole("textbox", { name: /Heading for Decisions captured/ }).fill("Calls made");
    await page.getByRole("checkbox", { name: "Include Wins" }).uncheck();
    await page.getByRole("button", { name: "Move What I need from you up" }).click();
    await expect(draft).toHaveValue(/Calls made\n- Pilot SMS/);
    await expect(draft).not.toHaveValue(/\nWins\n/);
    const text = await draft.inputValue();
    expect(text.indexOf("What I need from you")).toBeLessThan(text.indexOf("Coming up"));

    // The format is remembered.
    await go(page, "Overview");
    await go(page, "Leadership");
    await expect(page.getByRole("textbox", { name: /Heading for Decisions captured/ })).toHaveValue("Calls made");
    await expect(page.getByRole("checkbox", { name: "Include Wins" })).not.toBeChecked();

    // Copy, edit, start over.
    await page.getByRole("button", { name: "Copy" }).click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(await draft.inputValue());
    await draft.fill("My own words");
    await page.getByRole("button", { name: "Start over" }).click();
    await expect(draft).toHaveValue(/^Product update/);
    expect(errors).toEqual([]);
  });

  test("1:1 prep gathers the agenda, commitments and what changed, and opens the full workspace", async ({ page }) => {
    const errors = await open(page);
    await go(page, "Leadership");
    await tab(page, "1:1 prep");
    await expect(page.locator(".prep-head")).toContainText("1:1 with Jordan");
    await expect(card(page, "Commitments")).toContainText("Send the refill pilot readout");
    await expect(card(page, "Commitments")).toContainText("Q1 headcount approval");
    await expect(card(page, "Agenda")).toContainText("Eligibility checks for the top payers");
    await expect(card(page, "Since your last 1:1")).toContainText("Pilot SMS reminders");

    await page.getByLabel("Add a topic").fill("Board deck timeline");
    await page.getByLabel("Add a topic").press("Enter");
    await expect(card(page, "Agenda").locator(".workspace-list").first()).toContainText("Board deck timeline");

    await page.getByRole("button", { name: "Open the full 1:1 workspace" }).click();
    await expect(page.locator(".page-head h1")).toHaveText("1:1 with Jordan");
    await expect(card(page, "Agenda")).toContainText("Board deck timeline");
    await page.getByRole("button", { name: "Leadership" }).first().click();
    await expect(page.locator(".page-head h1")).toHaveText("Leadership");

    // The person can be changed.
    await tab(page, "1:1 prep");
    await page.getByRole("button", { name: "Change person" }).click();
    await expect(page.getByText("Who do you report to?")).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("roadmap items can be added, dated, linked to epics, edited and removed", async ({ page }) => {
    const errors = await open(page);
    await go(page, "Leadership");
    await tab(page, "Roadmap");
    await page.getByLabel("Roadmap item").first().fill("Portal accessibility audit");
    const date = await page.evaluate(() => {
      const d = new Date(Date.now() + 30 * 86_400_000);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    });
    await page.locator(".roadmap-form").first().locator("input[type=date]").fill(date);
    await page.locator(".roadmap-form").first().getByRole("button", { name: "Add" }).click();

    const item = page.locator(".pm-card", { hasText: "Portal accessibility audit" });
    await expect(item.locator(".roadmap-state")).toHaveText("No epics linked");
    await item.getByRole("combobox", { name: "Link an epic" }).click();
    await page.keyboard.type("PORT-1");
    await page.keyboard.press("Enter");
    await expect(item.locator(".epics")).toContainText("Patient portal beta");
    await expect(item.locator(".roadmap-state")).toHaveText("On track");
    await expect(item).toContainText("2 of 4 tickets done");

    await item.getByRole("button", { name: "Edit Portal accessibility audit" }).click();
    // In edit mode the title is in a field, so find the card by its form.
    const editor = page.locator(".pm-card .roadmap-form");
    await expect(editor.getByLabel("Roadmap item")).toHaveValue("Portal accessibility audit");
    await editor.getByLabel("Roadmap item").fill("Portal accessibility audit, phase 1");
    await editor.getByRole("button", { name: "Save" }).click();
    const renamed = page.locator(".pm-card", { hasText: "phase 1" });
    await expect(renamed).toBeVisible();

    await renamed.getByRole("button", { name: /Unlink Patient portal beta/ }).click();
    await expect(renamed.locator(".roadmap-state")).toHaveText("No epics linked");
    await renamed.getByRole("button", { name: /Delete Portal accessibility audit/ }).click();
    await expect(renamed).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test("priorities map the team's epics and show the work that serves none", async ({ page }) => {
    const errors = await open(page);
    await go(page, "Leadership");
    await tab(page, "Priorities");
    const cards = page.locator(".pm-card h2");
    await expect(cards).toHaveText(["Grow pharmacy adoption", "Patient self-service", "Platform reliability"]);
    const unmapped = card(page, "Open epics that serve no priority");
    await expect(unmapped).toContainText("Eligibility check");

    // Link the unmapped epic to the third priority; it leaves the unmapped list.
    const reliability = page.locator(".pm-card", { hasText: "Platform reliability" });
    await reliability.getByRole("combobox", { name: "Link an epic" }).click();
    await page.keyboard.type("REF-2");
    await page.keyboard.press("Enter");
    await expect(reliability).toContainText("1 off track");
    await expect(unmapped).toHaveCount(0);

    // Reorder and add.
    await page.getByRole("button", { name: "Move Platform reliability up" }).click();
    await expect(cards).toHaveText(["Grow pharmacy adoption", "Platform reliability", "Patient self-service"]);
    await page.getByLabel("Add a priority").fill("Cost to serve");
    await page.getByLabel("Add a priority").press("Enter");
    await expect(cards).toHaveCount(4);
    await expect(cards.last()).toHaveText("Cost to serve");
    expect(errors).toEqual([]);
  });

  test("the shipped log groups finished tickets by week and epic", async ({ page }) => {
    const errors = await open(page);
    await go(page, "Leadership");
    await tab(page, "Shipped");
    // Sample tickets were finished 1, 2, 4 and 9 days ago; which week they land in depends on today.
    let total = 0;
    for (const week of ["This week", "Last week", "2 weeks ago", "3 weeks ago"]) {
      await page.locator(".workspace-card .ant-segmented").getByText(week, { exact: true }).click();
      total += await page.locator(".workspace-card .workspace-list li").count();
    }
    expect(total).toBe(4);
    await page.locator(".workspace-card .ant-segmented").getByText("Last week", { exact: true }).click();
    await expect(page.locator("#shipped-title")).toContainText("Shipped in the week of");
    expect(errors).toEqual([]);
  });
});

test.describe("leadership, from a new install", () => {
  test("every tab explains what to do first", async ({ page }) => {
    const errors = await open(page, { empty: true });
    await expect(page.locator(".slip-banner")).toHaveCount(0);
    await go(page, "Leadership");
    await expect(page.locator(".alerts")).toHaveCount(0);
    const draft = page.getByRole("textbox", { name: "Draft weekly update" });
    await expect(draft).toHaveValue(/Shipped\n- Nothing this week\./);

    await tab(page, "1:1 prep");
    await expect(page.getByText("Who do you report to?")).toBeVisible();
    await page.getByLabel("Or add them by name").fill("Avery");
    await page.getByLabel("Or add them by name").press("Enter");
    await expect(page.locator(".prep-head")).toContainText("1:1 with Avery");
    await expect(card(page, "In the last week")).toContainText("No tracker connected");
    // The person's asks now feed the update.
    await page.getByLabel("Something I need from them").fill("Sign off the Q1 plan");
    await page.getByLabel("Something I need from them").press("Enter");
    await tab(page, "Weekly update");
    await expect(draft).toHaveValue(/What I need from you\n- Sign off the Q1 plan/);

    await tab(page, "Roadmap");
    await expect(page.getByText("Nothing on the roadmap yet.")).toBeVisible();
    await page.getByLabel("Roadmap item").first().fill("Launch in a second state");
    await page.locator(".roadmap-form").first().getByRole("button", { name: "Add" }).click();
    await expect(page.locator(".pm-card", { hasText: "Launch in a second state" })).toContainText(
      "No issue tracker is connected yet",
    );

    await tab(page, "Priorities");
    await page.getByLabel("Add a priority").fill("Grow adoption");
    await page.getByLabel("Add a priority").press("Enter");
    await expect(page.locator(".pm-card", { hasText: "Grow adoption" })).toContainText("No work linked to this priority yet.");

    await tab(page, "Shipped");
    await expect(page.getByText("No tickets synced yet")).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("decisions captured during the week appear in the update", async ({ page }) => {
    await open(page, { empty: true });
    await page.locator(".capture-button").click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Capture text").fill("Ship the beta to ten clinics first");
    await dialog.getByLabel("Kind").selectOption({ label: "Decision" });
    await dialog.getByRole("button", { name: "Save" }).click();
    await go(page, "Leadership");
    await expect(page.getByRole("textbox", { name: "Draft weekly update" })).toHaveValue(
      /Decisions\n- Ship the beta to ten clinics first/,
    );
  });
});
