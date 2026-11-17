import { expect, test } from "@playwright/test";
import { card, go, open } from "./helpers";

/** A Jira-style export. Finish dates are yesterday, so the tickets land in the shipped log. */
function jiraExport(options: { dropPause?: boolean } = {}): string {
  const yesterday = new Date(Date.now() - 86_400_000);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const jira = `${String(yesterday.getDate()).padStart(2, "0")}/${months[yesterday.getMonth()]}/${String(yesterday.getFullYear()).slice(2)} 2:30 PM`;
  return [
    "Summary,Issue key,Issue id,Issue Type,Status,Assignee,Team,Parent,Sprint,Created,Updated,Resolved",
    `Refill flow pilot,REF-1,10001,Epic,In Progress,Marco,,,,01/Oct/26 9:00 AM,${jira},`,
    `"Reminder service, v2",REF-21,10021,Story,Done,Lena,Offshore,10001,Sprint 24,03/Oct/26 9:00 AM,${jira},${jira}`,
    `SMS template,REF-22,10022,Story,Waiting for Product,Lena,Offshore,10001,Sprint 24,03/Oct/26 9:00 AM,${jira},`,
    ...(options.dropPause ? [] : [`Pause control,REF-24,10024,Story,Code Review,Sam,Offshore,10001,Sprint 24,05/Oct/26 9:00 AM,${jira},`]),
    `,REF-99,10099,Story,To Do,,,,,,,`,
  ].join("\r\n");
}

test("a tracker export imports, fills the delivery pages, and a newer export replaces it", async ({ page }) => {
  const errors = await open(page, { empty: true });
  await go(page, "Connections");
  await page.locator(".connector-list li", { hasText: "Tickets from a file" }).getByRole("button", { name: "Import" }).click();
  await page.getByLabel("CSV file").setInputFiles({ name: "jira-sprint-24.csv", mimeType: "text/csv", buffer: Buffer.from(jiraExport()) });

  // Columns are matched by name and shown with an example.
  await expect(page.getByRole("combobox", { name: "Column for Ticket key" })).toBeVisible();
  await expect(page.locator(".column-map li", { hasText: "Ticket key" })).toContainText("Issue key");
  // The example comes from the first row, the epic, which has no parent.
  await expect(page.locator(".column-map li", { hasText: "Epic or parent" })).toContainText("Parent(empty)");
  const preview = page.locator(".import-form .pm-section", { hasText: "Preview" });
  await expect(preview).toContainText("3 tickets and 1 epic");
  await expect(preview).toContainText("1 done");
  await expect(page.getByText("1 row will be left out")).toBeVisible();
  await expect(page.getByText("Row 6: No title.")).toBeVisible();
  await expect(preview.locator("tbody")).toContainText("Waiting for Product → Blocked, waiting on product");
  await expect(preview.locator("tbody")).toContainText("REF-1");
  await expect(page.getByLabel("Name in the app")).toHaveValue("jira-sprint-24");

  // Un-mapping a required column blocks the import and says why.
  const titleColumn = page.getByRole("combobox", { name: "Column for Title" });
  await titleColumn.click();
  await page.keyboard.type("none");
  await expect(page.locator(".ant-select-dropdown:visible .ant-select-item-option")).toHaveText(["(none)"]);
  // Click rather than press Return: under load the highlighted option can lag behind the typing.
  await page.locator(".ant-select-dropdown:visible .ant-select-item-option", { hasText: "(none)" }).click();
  await expect(page.getByText("Choose a column for: Title.")).toBeVisible();
  await expect(page.getByRole("button", { name: /^Import/ }).last()).toBeDisabled();
  await titleColumn.click();
  await page.keyboard.type("Summary");
  await expect(page.locator(".ant-select-dropdown:visible .ant-select-item-option")).toHaveText(["Summary"]);
  await page.locator(".ant-select-dropdown:visible .ant-select-item-option", { hasText: "Summary" }).click();
  await expect(page.getByText("Choose a column for: Title.")).toHaveCount(0);

  await page.getByPlaceholder("https://yourcompany.atlassian.net/browse/{key}").fill("https://acme.atlassian.net/browse/{key}");
  await page.getByRole("button", { name: "Import 4" }).click();
  const imported = page.locator(".pm-card", { hasText: "jira-sprint-24" });
  await expect(imported).toContainText("Imported jira-sprint-24.csv: 4 tickets and epics, just now.");
  await expect(imported.getByRole("switch")).toHaveCount(0);

  // Delivery and the team board fill in.
  await go(page, "Delivery");
  const offshore = page.locator(".pulse", { hasText: "Offshore" });
  await expect(offshore.locator(".pulse-figure")).toContainText("1 of 3 done");
  await expect(card(page, "Blocked or waiting on product")).toContainText("SMS template");
  await go(page, "Team");
  await page.getByLabel("Add a PM by name").fill("Marco");
  await page.getByLabel("Add a PM by name").press("Enter");
  await expect(page.locator(".pm-card", { hasText: "Marco" }).locator(".epics li")).toHaveText([/Refill flow pilot\s*1\/3\s*At risk/]);

  // The shipped log, on whichever week yesterday fell in.
  await go(page, "Leadership");
  await page.locator(".page-head .ant-segmented").getByText("Shipped", { exact: true }).click();
  const weeks = page.locator(".workspace-card .ant-segmented");
  let found = false;
  for (const week of ["This week", "Last week"]) {
    await weeks.getByText(week, { exact: true }).click();
    if ((await page.locator(".workspace-card", { hasText: "Reminder service, v2" }).count()) > 0) found = true;
  }
  expect(found).toBe(true);

  // A newer export without REF-24: it disappears, and the column choices are remembered.
  await go(page, "Connections");
  await imported.getByRole("button", { name: "Import a newer file" }).click();
  await page.getByLabel("CSV file").setInputFiles({ name: "jira-later.csv", mimeType: "text/csv", buffer: Buffer.from(jiraExport({ dropPause: true })) });
  await expect(page.getByPlaceholder("https://yourcompany.atlassian.net/browse/{key}")).toHaveValue("https://acme.atlassian.net/browse/{key}");
  await page.getByRole("button", { name: "Import 3" }).click();
  await expect(imported).toContainText("Imported jira-later.csv: 3 tickets and epics");
  await go(page, "Delivery");
  await expect(offshore.locator(".pulse-figure")).toContainText("1 of 2 done");

  // Removing the import removes its tickets.
  await go(page, "Connections");
  await imported.getByRole("button", { name: "Remove" }).click();
  await page.getByRole("button", { name: "Remove", exact: true }).last().click();
  await go(page, "Delivery");
  await expect(page.getByText("No tickets synced yet")).toBeVisible();
  expect(errors).toEqual([]);
});

test("a file that is not a usable export says so", async ({ page }) => {
  await open(page, { empty: true });
  await go(page, "Connections");
  await page.locator(".connector-list li", { hasText: "Tickets from a file" }).getByRole("button", { name: "Import" }).click();
  await page.getByLabel("CSV file").setInputFiles({ name: "empty.csv", mimeType: "text/csv", buffer: Buffer.from("Key,Title,Status\n") });
  await expect(page.getByText("That file has no rows under its header.")).toBeVisible();
  await page.getByLabel("CSV file").setInputFiles({ name: "odd.csv", mimeType: "text/csv", buffer: Buffer.from("Foo,Bar\n1,2\n") });
  await expect(page.getByText("Choose a column for: Ticket key, Title, Status.")).toBeVisible();
});
