import { expect, test } from "@playwright/test";
import { card, go, noSidewaysScroll, open, PAGES, stat } from "./helpers";

// The preview's sample data: a few weeks of captures, synced activity and tickets.
test.describe("with sample data", () => {
  test("the overview's numbers agree with each other and with the other pages", async ({ page }) => {
    const errors = await open(page);
    const waiting = Number(await stat(page, "Waiting on me").innerText());
    expect(waiting).toBeGreaterThan(0);
    await expect(card(page, "Waiting on you").locator("ul li")).toHaveCount(Math.min(waiting, 5));
    await expect(page.locator(".nav-item", { hasText: "Captures" }).locator(".nav-badge")).toHaveText(String(waiting));
    await expect(page.locator(".hero h2")).toContainText(`${waiting} things are still waiting on you`);

    // The ring matches "closed X of Y".
    const [, cleared, total] = /closed (\d+) of (\d+)/.exec(await page.locator(".hero-text").innerText())!;
    await expect(page.locator(".ring-text strong")).toHaveText(`${Math.round((Number(cleared) / Number(total)) * 100)}%`);
    expect(Number(total) - Number(cleared)).toBe(waiting);

    // The hero button lands on the open filter, which lists what is waiting on me and on others.
    const others = Number(await stat(page, "Waiting on others").innerText());
    await page.getByRole("button", { name: "Review open items" }).click();
    await expect(page.locator(".page-head h1")).toHaveText("Open");
    const openRows = await page.locator(".capture").count();
    expect(openRows).toBeGreaterThanOrEqual(waiting + others);

    await go(page, "Commitments");
    await expect(card(page, "I promised").locator(".item")).toHaveCount(waiting);
    await expect(card(page, "Promised to me").locator(".item")).toHaveCount(others);

    expect(errors).toEqual([]);
  });

  test("the brief fits one screen and the queue can be re-sorted and cleared", async ({ page }) => {
    const errors = await open(page);
    await go(page, "Brief");
    await expect(card(page, "Needs my decision").locator(".item")).toHaveCount(3);
    await expect(card(page, "Awaiting my review").locator(".item-title")).toHaveText([/Refill flow PRD/]);
    await expect(card(page, "No reply in three days").locator(".item-title")).toHaveText([/Analytics access/]);
    await expect(card(page, "While you were away").locator(".item").first()).toBeVisible();
    expect(await page.evaluate(() => {
      const main = document.querySelector(".main")!;
      return main.scrollHeight <= main.clientHeight + 1;
    })).toBe(true);

    const badge = page.locator(".nav-item", { hasText: "Queue" }).locator(".nav-badge");
    await expect(badge).toHaveText("4");

    // Dismissing a decision takes it out of the brief, the queue and the count.
    await card(page, "Needs my decision").locator(".item", { hasText: "Release 4.2" }).getByRole("button", { name: "Dismiss" }).click();
    await expect(card(page, "Needs my decision").locator(".item")).toHaveCount(2);
    await expect(badge).toHaveText("3");

    await go(page, "Queue");
    const decisions = card(page, "Needs my decision");
    const fyi = card(page, "FYI");
    await expect(decisions.locator(".item")).toHaveCount(3);
    await expect(decisions).not.toContainText("Release 4.2");
    const fyiBefore = await fyi.locator(".item").count();

    // Moving an FYI into decisions.
    await fyi.locator(".item", { hasText: "Board deck timeline" }).getByRole("button", { name: "Move to another list" }).click();
    await page.getByRole("menuitem", { name: "Needs my decision" }).click();
    await expect(decisions).toContainText("Board deck timeline");
    await expect(fyi.locator(".item")).toHaveCount(fyiBefore - 1);
    await expect(badge).toHaveText("4");

    // And back out again.
    await decisions.locator(".item", { hasText: "Board deck timeline" }).getByRole("button", { name: "Move to another list" }).click();
    await page.getByRole("menuitem", { name: "FYI" }).click();
    await expect(badge).toHaveText("3");

    // Every item offers its source link.
    await expect(decisions.locator(".item-title").first()).toHaveAttribute("title", "Open in its own system");
    expect(errors).toEqual([]);
  });

  test("delivery shows sprint progress, risks, blockers and quiet tickets", async ({ page }) => {
    const errors = await open(page);
    await go(page, "Delivery");
    const offshore = page.locator(".pulse", { hasText: "Offshore" });
    const onshore = page.locator(".pulse", { hasText: "Onshore" });
    await expect(offshore.locator(".pulse-figure")).toContainText("29%");
    await expect(offshore.locator(".pulse-figure")).toContainText("2 of 7 done");
    await expect(offshore).toContainText("2 in progress · 2 blocked · 1 not started");
    await expect(offshore.locator(".item-title")).toHaveText([/Payer response mapping/, /SMS reminder template/]);
    await expect(offshore).toContainText("Waiting on a product answer");
    await expect(onshore.locator(".pulse-figure")).toContainText("50%");
    await expect(onshore).toContainText("Nothing looks likely to miss.");
    await expect(card(page, "Blocked or waiting on product").locator(".item")).toHaveCount(2);
    await expect(card(page, "Gone quiet").locator(".item-title")).toHaveText([/Pharmacist pause control/]);

    // The same tickets drive epic health on the team board.
    await go(page, "Team");
    await expect(page.locator(".pm-card", { hasText: "Priya" }).locator(".epics li")).toHaveText([/Patient portal beta\s*2\/4\s*On track/]);
    await expect(page.locator(".pm-card", { hasText: "Marco" }).locator(".epics li")).toHaveText([
      /Eligibility check\s*0\/2\s*Off track/,
      /Refill flow pilot\s*1\/4\s*At risk/,
    ]);
    expect(errors).toEqual([]);
  });

  test("handoff works out shared hours and drafts a note that can be copied", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    const errors = await open(page);
    await go(page, "Handoff");

    await page.locator(".handoff-settings .ant-select").click();
    await page.keyboard.type("Kolkata");
    await page.keyboard.press("Enter");
    const facts = page.locator(".facts");
    // A standard India day never overlaps a 9 to 5:30 Chicago day.
    await expect(facts).toContainText("None. Everything goes in the note.");
    await expect(facts).toContainText("5:30 PM");

    // A late shift does: 1pm to 10pm in India is 1:30am to 10:30am in Chicago.
    await page.locator(".handoff-settings input[type=time]").nth(0).fill("13:00");
    await page.locator(".handoff-settings input[type=time]").nth(1).fill("22:00");
    await expect(facts).toContainText("9:00 AM to 10:30 AM your time (1 h 30 min)");

    const send = card(page, "Before you sign off");
    await expect(send).toContainText("REF-22 SMS reminder template");
    // Only the offshore team's tickets, until the team name is cleared.
    await page.getByPlaceholder("Leave empty for every team").fill("Onshore");
    await expect(send).toContainText("Nothing is waiting on you.");
    await page.getByPlaceholder("Leave empty for every team").fill("Offshore");
    await expect(send).toContainText("REF-22 SMS reminder template");

    const note = page.getByRole("textbox", { name: "Draft handoff note" });
    await expect(note).toHaveValue(/- REF-22 SMS reminder template: \[your answer\]/);
    await expect(note).toHaveValue(/- Estimate for the eligibility check API/);
    await page.getByRole("button", { name: "Copy" }).click();
    await expect(page.getByRole("button", { name: "Copied" })).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(await note.inputValue());

    // Edits are kept until thrown away.
    await note.fill("My own note");
    await page.getByRole("button", { name: "Start over" }).click();
    await expect(note).toHaveValue(/^Handoff for /);

    // Settings survive leaving the page.
    await go(page, "Overview");
    await go(page, "Handoff");
    await expect(page.locator(".handoff-settings .ant-select")).toContainText("Kolkata");
    await expect(page.locator(".handoff-settings input[type=time]").nth(0)).toHaveValue("13:00");
    expect(errors).toEqual([]);
  });

  test("analytics totals follow the period, and the chart matches its table", async ({ page }) => {
    const errors = await open(page);
    await go(page, "Analytics");
    const totals: number[] = [];
    for (const [period, columns] of [["7 days", 7], ["30 days", 30], ["13 weeks", 13]] as const) {
      await page.locator(".ant-segmented").getByText(period).click();
      await expect(page.locator(".column")).toHaveCount(columns);
      totals.push(Number(await stat(page, "Captured").innerText()));
    }
    // A longer period can only hold more.
    expect(totals[0]).toBeLessThanOrEqual(totals[1]);
    expect(totals[1]).toBeLessThanOrEqual(totals[2]);
    expect(totals[0]).toBeGreaterThan(0);

    // Keyboard focus shows a readout.
    await page.locator(".column").last().focus();
    await expect(page.locator(".tooltip")).toContainText(/captures?/);

    // The table adds up to the headline number.
    await page.getByRole("button", { name: "Show as table" }).click();
    const cells = await page.locator(".chart-table tbody tr.ant-table-row td:last-child").allInnerTexts();
    expect(cells).toHaveLength(13);
    expect(cells.reduce((sum, cell) => sum + Number(cell), 0)).toBe(totals[2]);
    await page.getByRole("button", { name: "Show chart" }).click();
    await expect(page.locator(".column")).toHaveCount(13);
    expect(errors).toEqual([]);
  });
});

test.describe("layout and access", () => {
  test("no page scrolls sideways on a phone, and navigation still works", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const errors = await open(page);
    for (const name of PAGES) {
      await page.locator(".sidebar nav .nav-item", { hasText: name }).click();
      await expect(page.locator(".sidebar nav .nav-item.selected")).toContainText(name);
      await noSidewaysScroll(page);
    }
    // Quick capture is reachable and usable at this width.
    await page.getByRole("button", { name: "Quick capture" }).first().click();
    await page.getByRole("dialog").getByLabel("Capture text").fill("From a phone-width window");
    await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
    await expect(page.locator(".capture", { hasText: "From a phone-width window" })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("no page scrolls sideways at the smallest window the Mac app allows", async ({ page }) => {
    await page.setViewportSize({ width: 720, height: 440 });
    await open(page);
    for (const name of PAGES) {
      await page.locator(".sidebar nav .nav-item", { hasText: name }).click();
      await noSidewaysScroll(page);
    }
  });

  test("dark mode renders every page without errors", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    const errors = await open(page);
    for (const name of PAGES) await go(page, name);
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--page").trim())).toBe("#05062a");
    expect(errors).toEqual([]);
  });

  test("reduced motion turns animation off", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await open(page);
    expect(await page.locator(".stat").first().evaluate((element) => getComputedStyle(element).animationName)).toBe("none");
  });

  test("the app can be driven from the keyboard", async ({ page }) => {
    await open(page);
    // The current page is announced.
    await expect(page.locator(".sidebar nav [aria-current=page]")).toHaveText(/Overview/);
    // Tab reaches navigation; Enter activates it.
    await page.locator(".sidebar nav .nav-item", { hasText: "Team" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.locator(".page-head h1")).toHaveText("Team");
    // Every icon-only button has a name.
    await go(page, "Captures");
    const unnamed = await page.locator("button").evaluateAll((buttons) =>
      buttons.filter((button) => !(button.textContent ?? "").trim() && !button.getAttribute("aria-label")).length,
    );
    expect(unnamed).toBe(0);
    // Tabbing from the search field lands on the first filter, with a visible focus ring.
    await page.getByLabel("Search captures").focus();
    await page.keyboard.press("Tab");
    const first = page.locator(".filter-item").first();
    await expect(first).toBeFocused();
    expect(await first.evaluate((element) => getComputedStyle(element).outlineStyle)).not.toBe("none");
  });
});
