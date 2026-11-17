import { expect, test, type Page } from "@playwright/test";
import { capture, go, open } from "./helpers";

async function tab(page: Page, name: string) {
  await page.locator(".page-head .ant-segmented").getByText(name, { exact: true }).click();
}

async function choose(page: Page, label: string | RegExp, option: string) {
  await page.getByRole("combobox", { name: label }).click();
  await page.locator(".ant-select-dropdown:visible .ant-select-item-option", { hasText: option }).first().click();
}

test.describe("influence, with sample data", () => {
  test("the narrative bank filters, selects and exports for a deck", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    const errors = await open(page);
    await go(page, "Influence");
    const rows = page.locator(".workspace-card .items .item");
    await expect(page.locator("#bank-title")).toHaveText("9 entries");

    await page.locator(".bank-filters .ant-segmented").first().getByText("Metric", { exact: true }).click();
    await expect(rows).toHaveCount(2);
    await page.locator(".bank-filters .ant-segmented").first().getByText("All", { exact: true }).click();
    await choose(page, "Filter by project", "Patient portal");
    await expect(rows).toHaveCount(3);
    await choose(page, "Filter by project", "Every project");

    await page.getByRole("checkbox", { name: /Select: Support tickets down 33%/ }).check();
    await page.getByRole("checkbox", { name: /Select: Pharmacist at a pilot store/ }).check();
    await page.getByRole("button", { name: "Copy selected (2)" }).click();
    const exported = await page.evaluate(() => navigator.clipboard.readText());
    expect(exported).toMatch(/^Patient portal\n- Metric: Support tickets down 33% since the portal beta \(/);
    expect(exported).toContain("Refill flow\n- Customer evidence: Pharmacist at a pilot store");
    expect(exported.split("\n").filter((line) => line.startsWith("- "))).toHaveLength(2);

    // Adding an entry, and the period filter.
    await page.getByLabel("What happened").fill("Renewal from the largest clinic group");
    await choose(page, "Type", "Customer evidence");
    await page.locator(".bank-form").getByRole("button", { name: "Add" }).click();
    await expect(page.locator("#bank-title")).toHaveText("10 entries");
    await page.locator(".bank-filters .ant-segmented").nth(1).getByText("30 days", { exact: true }).click();
    await expect(rows.first()).toContainText("Renewal from the largest clinic group");
    expect(errors).toEqual([]);
  });

  test("the stakeholder map shows goals, concerns, last asks and who has gone quiet", async ({ page }) => {
    const errors = await open(page);
    await go(page, "Influence");
    await tab(page, "Stakeholders");
    const morgan = page.locator(".pm-card", { hasText: "Morgan" });
    await expect(morgan).toContainText("CFO");
    await expect(morgan).toContainText("Pilots that never turn into revenue.");
    await expect(morgan.locator(".pm-section", { hasText: "Last asked about" })).toContainText("Cost to onboard each new pharmacy");
    await expect(page.locator(".pm-card", { hasText: "Taylor" }).locator(".quiet")).toHaveText("No contact yet");

    // Log an ask from the card; it becomes the last ask.
    await page.locator(".pm-card", { hasText: "Taylor" }).getByRole("button", { name: "Log an ask" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByLabel("Kind")).toHaveValue("ask_of_me");
    await dialog.getByLabel("Capture text").fill("A one-page view of Q1 risks");
    await dialog.getByRole("button", { name: "Save" }).click();
    const taylor = page.locator(".pm-card", { hasText: "Taylor" });
    await expect(taylor.locator(".pm-section", { hasText: "Last asked about" })).toContainText("A one-page view of Q1 risks");
    await expect(taylor.locator(".quiet")).toHaveCount(0);

    // Edit a profile.
    await taylor.getByRole("button", { name: "Edit Taylor" }).click();
    await taylor.getByLabel("What they are trying to achieve").fill("Grow revenue 40% next year.");
    await taylor.getByRole("button", { name: "Save" }).click();
    await expect(page.locator(".pm-card", { hasText: "Taylor" })).toContainText("Grow revenue 40% next year.");

    // Add someone new by name, then take them off the map.
    await page.getByLabel("Their role").fill("COO");
    await page.getByLabel("Their name").fill("Casey");
    await page.getByLabel("Their name").press("Enter");
    const casey = page.locator(".pm-card", { hasText: "Casey" });
    await expect(casey).toContainText("COO");
    await casey.getByRole("button", { name: "Take Casey off the map" }).click();
    await page.locator(".ant-popconfirm").getByRole("button", { name: "Take off" }).click();
    await expect(casey).toHaveCount(0);

    // Notes and agenda open the shared 1:1 workspace.
    await morgan.getByRole("button", { name: "Notes and agenda" }).click();
    await expect(page.locator(".page-head h1")).toHaveText("1:1 with Morgan");
    await page.getByRole("button", { name: "Influence" }).first().click();
    await expect(page.locator(".page-head h1")).toHaveText("Influence");
    expect(errors).toEqual([]);
  });

  test("a pre-read leads with the ask, cites evidence and is saved", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    const errors = await open(page);
    await go(page, "Influence");
    await tab(page, "Pre-reads");
    const preview = page.getByLabel("Pre-read preview");
    await expect(preview).toContainText("For Morgan, CFO");
    await expect(page.locator(".reminder")).toContainText("Pilots that never turn into revenue.");
    const text = await preview.innerText();
    expect(text.indexOf("The ask")).toBeLessThan(text.indexOf("Why now"));
    expect(text).not.toContain("Background");

    await page.getByRole("combobox", { name: "Evidence from the narrative bank" }).click();
    await page.locator(".ant-select-dropdown:visible .ant-select-item-option", { hasText: "Refill pickup rate up" }).click();
    await page.keyboard.press("Escape");
    await expect(preview).toContainText("Evidence\n- Refill pickup rate up from 71% to 84% at pilot pharmacies");
    await expect(page.getByText("Not saved yet")).toBeVisible();
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText("Saved", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Copy" }).click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(await preview.innerText());

    // A new pre-read warns about what is missing.
    await page.getByLabel("New pre-read").fill("Hire a second offshore team");
    await page.getByLabel("New pre-read").press("Enter");
    await expect(page.locator(".filter-item.selected")).toHaveText("Hire a second offshore team");
    await expect(page.getByText("State the ask. It goes first.")).toBeVisible();
    await page.getByLabel("The ask", { exact: true }).fill("Approve two more engineers.");
    await choose(page, "Meeting with", "Taylor");
    await page.getByLabel("Recommendation", { exact: true }).fill("Hire in January.");
    await expect(page.getByText("Before you send")).toHaveCount(0);
    await page.getByRole("button", { name: "Save", exact: true }).click();

    // Both are kept; switching back shows the first, and the saved evidence.
    await page.locator(".filter-item", { hasText: "Expand the refill pilot" }).click();
    await expect(preview).toContainText("Refill pickup rate up");
    await page.locator(".filter-item", { hasText: "Hire a second offshore team" }).click();
    await expect(preview).toContainText("For Taylor, CEO");
    await page.getByRole("button", { name: "Delete" }).click();
    await page.locator(".ant-popconfirm").getByRole("button", { name: "Delete" }).click();
    await expect(page.locator(".filter-item", { hasText: "Hire a second offshore team" })).toHaveCount(0);
    expect(errors).toEqual([]);
  });
});

test.describe("influence, from a new install", () => {
  test("every tab explains what to do first, and metrics captured anywhere reach the bank", async ({ page }) => {
    const errors = await open(page, { empty: true });
    await go(page, "Influence");
    await expect(page.getByText("Nothing yet. Tag captures as wins")).toBeVisible();
    await expect(page.getByRole("button", { name: "Copy everything shown" })).toBeDisabled();

    await capture(page, { text: "Onboarding time down from 6 weeks to 2", kind: "Metric" });
    await expect(page.locator("#bank-title")).toHaveText("1 entry");

    await tab(page, "Stakeholders");
    await expect(page.getByText("No executives on the map yet.")).toBeVisible();
    await tab(page, "Pre-reads");
    await expect(page.getByText("One page, ask first")).toBeVisible();
    await page.getByLabel("New pre-read").fill("Budget for Q1");
    await page.getByLabel("New pre-read").press("Enter");
    await expect(page.getByText("Add executives under Stakeholders to choose them here.")).toBeVisible();
    await expect(page.getByText("Choose who the meeting is with.")).toBeVisible();
    expect(errors).toEqual([]);
  });
});
